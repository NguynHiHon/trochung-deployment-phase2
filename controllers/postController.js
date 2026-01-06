
const Post = require('../models/Post');
const Room = require('../models/Room');
const User = require('../models/Users');
const IsLandor = require('../models/IsLandor');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const { console } = require('inspector');
const { matchRoomsWithAI } = require('../services/searchAI/aiMatchingService');

// Utility: escape string for use in RegExp
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// API: Admin change status of post (pending <-> rejected)
exports.changeStatusPost = async (req, res) => {
    try {
        const postId = req.params.id;
        if (!postId) return res.status(400).json({ success: false, message: 'Missing post id' });
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
        // Only allow toggle between pending <-> rejected
        let newStatus = 'pending';
        if (post.status === 'pending') newStatus = 'rejected';
        else if (post.status === 'rejected') newStatus = 'pending';
        else return res.status(400).json({ success: false, message: 'Only posts with status pending or rejected can be toggled' });
        post.status = newStatus;
        await post.save();
        return res.json({ success: true, post });
    } catch (err) {
        console.error('changeStatusPost error', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
// Lấy danh sách tất cả phòng trọ với thông tin chi tiết
exports.getAllRooms = async (req, res) => {
    try {
        // Support paginated queries and basic filters via query params
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 12));
        const skip = (page - 1) * limit;

        console.log('🔍 ALL Query Params:', req.query);

        const q = {};
        // Only include rooms whose post exists and is not rejected - we'll filter after populate

        // Search in title / address / user based on searchType
        let searchByTitle = null;
        let searchByUser = null;

        if (req.query.search) {
            const searchType = req.query.searchType || 'title';

            if (searchType === 'title') {
                // For title search, we'll filter after populate to search in post.title and room fields
                searchByTitle = req.query.search;
            } else if (searchType === 'user') {
                // Search by username - we'll filter after populate
                searchByUser = req.query.search;
            }
        }

        // Price range (expected in millions or VND? frontend sends minPrice/maxPrice in millions)
        if (req.query.minPrice || req.query.maxPrice) {
            const min = Number(req.query.minPrice || 0);
            const max = Number(req.query.maxPrice || 0);
            // assume frontend sends price in millions -> convert to VND if small
            const minV = min > 0 && min < 1000 ? Math.round(min * 1000000) : min;
            const maxV = max > 0 && max < 1000 ? Math.round(max * 1000000) : max;
            q.price = {};
            if (minV) q.price.$gte = minV;
            if (maxV) q.price.$lte = maxV;
        }

        // Area
        if (req.query.minArea || req.query.maxArea) {
            q.area = {};
            if (req.query.minArea) q.area.$gte = Number(req.query.minArea);
            if (req.query.maxArea) q.area.$lte = Number(req.query.maxArea);
        }

        if (req.query.city) {
            // Flexible search: match with or without prefix (Thành phố, Tỉnh, TP.)
            const cityName = escapeRegExp(req.query.city);
            q.province = new RegExp('(Thành phố |Tỉnh |TP\\.?\\s*)?' + cityName, 'i');
        }
        if (req.query.district) {
            // Flexible search: match with or without prefix (Quận, Huyện, Thị xã, Thành phố)
            const districtName = escapeRegExp(req.query.district);
            q.district = new RegExp('(Quận |Huyện |Thị xã |Thành phố |TX\\.?\\s*|TP\\.?\\s*)?' + districtName, 'i');
        }
        if (req.query.ward) {
            // Flexible search: match with or without prefix (Phường, Xã, Thị trấn)
            const wardName = escapeRegExp(req.query.ward);
            q.ward = new RegExp('(Phường |Xã |Thị trấn |TT\\.?\\s*|P\\.?\\s*|X\\.?\\s*)?' + wardName, 'i');
        }

        if (req.query.types) {
            const arr = String(req.query.types).split(',').map(s => s.trim()).filter(Boolean);
            if (arr.length) q.roomType = { $in: arr };
        }

        // Utilities filter - will be applied in aggregation pipeline for better regex support
        let utilitiesFilter = null;
        if (req.query.utilities) {
            const utilArr = String(req.query.utilities).split(',').map(s => s.trim()).filter(Boolean);
            if (utilArr.length) {
                console.log('🔍 Utilities Filter Query:', utilArr);
                // Store for later use in pipeline
                utilitiesFilter = utilArr;
            }
        }

        console.log('🔍 Final Room Query:', JSON.stringify(q, null, 2));

        // Use aggregation to filter by post status before pagination
        let pipeline = [
            { $match: q }
        ];

        // Lookup posts first to filter by postType if provided
        pipeline = pipeline.concat([
            {
                $lookup: {
                    from: 'posts',
                    localField: 'post',
                    foreignField: '_id',
                    as: 'postData'
                }
            },
            { $unwind: { path: '$postData', preserveNullAndEmptyArrays: false } },
            {
                $match: {
                    'postData.status': { $ne: 'rejected' }
                }
            }
        ]);

        // Filter by postType if specified
        if (req.query.postType) {
            console.log('🔍 [DEBUG] Filtering by postType:', req.query.postType);
            pipeline.push({
                $match: {
                    'postData.postType': req.query.postType
                }
            });
        }

        // Continue with other lookups
        pipeline = pipeline.concat([
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userData'
                }
            },
            { $unwind: { path: '$userData', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'user_infos',
                    localField: 'user',
                    foreignField: 'userId',
                    as: 'userInfoData'
                }
            },
            { $unwind: { path: '$userInfoData', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'ratings',
                    localField: 'post',
                    foreignField: 'post',
                    as: 'ratingsData'
                }
            },
            {
                $addFields: {
                    averageRating: {
                        $cond: {
                            if: { $gt: [{ $size: '$ratingsData' }, 0] },
                            then: { $avg: '$ratingsData.stars' },
                            else: 0
                        }
                    },
                    totalRatings: { $size: '$ratingsData' }
                }
            }
        ]);

        // Apply utilities filter in pipeline with case-insensitive regex
        if (utilitiesFilter && utilitiesFilter.length > 0) {
            console.log('🔍 [DEBUG] Utilities from query:', utilitiesFilter);

            // Room must have ALL specified utilities (case-insensitive match)
            // Use $and with $elemMatch for each utility to ensure all are present
            const utilityMatches = utilitiesFilter.map(u => {
                const escapedU = escapeRegExp(u);
                console.log(`🔍 [DEBUG] Processing utility: "${u}" -> escaped: "${escapedU}"`);
                return {
                    utilities: {
                        $elemMatch: { $regex: escapedU, $options: 'i' }
                    }
                };
            });

            console.log('🔍 [DEBUG] Generated utility matches:', JSON.stringify(utilityMatches, null, 2));

            const matchStage = {
                $match: {
                    $and: utilityMatches
                }
            };

            console.log('🔍 [DEBUG] Adding match stage:', JSON.stringify(matchStage, null, 2));
            pipeline.push(matchStage);

            console.log('🔍 [DEBUG] Pipeline after utilities filter:', JSON.stringify(pipeline, null, 2));
        }

        // Additional filters after populate
        console.log('🔍 [DEBUG] Pipeline before additional filters:', pipeline.length, 'stages');

        if (searchByTitle) {
            const titleRe = escapeRegExp(searchByTitle);
            pipeline.push({
                $match: {
                    $or: [
                        { 'postData.title': { $regex: titleRe, $options: 'i' } },
                        { address: { $regex: titleRe, $options: 'i' } },
                        { province: { $regex: titleRe, $options: 'i' } },
                        { district: { $regex: titleRe, $options: 'i' } }
                    ]
                }
            });
        }

        if (searchByUser) {
            const userRe = escapeRegExp(searchByUser);
            pipeline.push({
                $match: {
                    $or: [
                        { 'userData.username': { $regex: userRe, $options: 'i' } },
                        { 'userData.email': { $regex: userRe, $options: 'i' } }
                    ]
                }
            });
        }

        // Get total count with filters
        const countPipeline = [...pipeline, { $count: 'total' }];
        const countResult = await Room.aggregate(countPipeline);
        const totalCount = countResult.length > 0 ? countResult[0].total : 0;

        // Sorting
        let sortStage = { createdAt: -1 };
        if (req.query.sort === 'newest') sortStage = { createdAt: -1 };
        else if (req.query.sort === 'priceAsc') sortStage = { price: 1 };
        else if (req.query.sort === 'priceDesc') sortStage = { price: -1 };

        console.log('🔍 [DEBUG] About to execute aggregation with', pipeline.length, 'stages');

        pipeline.push({ $sort: sortStage });
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: limit });

        const rooms = await Room.aggregate(pipeline);

        console.log('🔍 [DEBUG] Found rooms count after filters:', rooms.length);
        console.log('🔍 [DEBUG] Total rooms available:', totalCount);
        if (req.query.utilities) {
            console.log('🔍 [DEBUG] Utilities query param:', req.query.utilities);
            if (rooms.length > 0) {
                console.log('🔍 [DEBUG] First room utilities:', rooms[0].utilities);
                console.log('🔍 [DEBUG] First 3 rooms utilities:', rooms.slice(0, 3).map(r => ({ id: r._id, utilities: r.utilities })));
            } else {
                console.log('🔍 [DEBUG] No rooms found matching utilities filter!');
            }
        }

        // Format data để phù hợp với frontend
        const formattedRooms = rooms.map(room => ({
            id: room._id.toString(),
            postId: room.postData?._id?.toString() || null,
            title: room.postData?.title || 'Không có tiêu đề',
            postType: room.postData?.postType || 'room_rental',
            postTier: room.postData?.postTier || 'normal',
            price: room.price,
            unit: room.unit,
            area: room.area,
            beds: room.beds || 0,
            baths: room.baths || 0,
            roomType: room.roomType,
            address: room.address,
            city: room.province,
            district: room.district,
            district: room.district,
            ward: room.ward,
            image: room.images && room.images.length > 0 ? room.images[0] : '/logo512.png',
            images: room.images || [],
            videos: room.videos || [],
            utilities: room.utilities || [],
            additionalCosts: room.additionalCosts || [],
            notes: room.notes || '',
            author: room.userData?.username || 'Người đăng',
            authorAvatar: room.userInfoData?.avatar || null,
            phone: room.userData?.phone || '',
            email: room.userData?.email || '',
            description: room.postData?.overviewDescription || '',
            status: room.postData?.status || 'pending',
            postedAt: room.postData?.createdAt || room.createdAt,
            rating: room.averageRating ? Number(room.averageRating.toFixed(1)) : 0,
            totalRatings: room.totalRatings || 0,
            location: {
                lat: 10.77653,
                lng: 106.70098,
                address: `${room.address}, ${room.district}, ${room.province}`
            },
            // Thêm thông tin từ UserInfo cho AI matching
            authorInterests: room.userInfoData?.interests || [],
            authorHabits: room.userInfoData?.habits || [],
            authorDislikes: room.userInfoData?.dislikes || [],
            authorBio: room.userInfoData?.bio || '',
            authorAge: room.userInfoData?.age || null,
            authorGender: room.userInfoData?.gender || null,
            authorProfession: room.userInfoData?.profession || ''
        }));


        // AI Search Processing
        let aiMessage = null;
        let aiStats = null;
        let finalRooms = formattedRooms; // Giữ format gốc
        const textSearchAI = req.query.textSearchAI || req.query.TextSearchAI;

        if (textSearchAI) {
            console.log('🤖 [Controller] AI Search detected:', textSearchAI);

            // Gửi formattedRooms (đã có format chuẩn) cho AI service
            const aiResult = await matchRoomsWithAI(formattedRooms, textSearchAI);

            if (aiResult.success && aiResult.matchedIds && aiResult.matchedIds.length > 0) {
                console.log('🤖 [Controller] AI matching successful, filtering formatted rooms');

                // Tạo Map từ formattedRooms để tra cứu nhanh
                const roomMap = new Map();
                formattedRooms.forEach(room => {
                    roomMap.set(room.id, room);
                });

                // Tạo Map reasons từ AI
                const reasonMap = new Map();
                aiResult.matchedIds.forEach(item => {
                    reasonMap.set(item.id, item.reason);
                });

                // Filter và sắp xếp theo thứ tự AI suggest, giữ nguyên format gốc
                finalRooms = aiResult.matchedIds
                    .map(item => {
                        const room = roomMap.get(item.id);
                        if (room) {
                            return {
                                ...room, // Giữ nguyên tất cả fields từ format gốc
                                aiReason: reasonMap.get(item.id) // Chỉ thêm aiReason
                            };
                        }
                        return null;
                    })
                    .filter(room => room !== null);

                aiStats = aiResult.stats;
                console.log('🤖 [Controller] Final matched rooms:', finalRooms.length);
            } else {
                console.log('🤖 [Controller] AI matching failed or no matches, using default results');
                aiMessage = aiResult.message || 'Không tìm thấy phòng phù hợp với yêu cầu AI';
            }
        }


        res.json({
            success: true,
            rooms: finalRooms, // Trả về finalRooms (có thể là formattedRooms gốc hoặc filtered by AI)
            total: totalCount,
            aiMessage: aiMessage,
            aiStats: aiStats
        });
    } catch (error) {
        console.error('Error fetching rooms:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy danh sách phòng trọ',
            error: error.message
        });
    }
};

// Lấy chi tiết một phòng trọ theo ID
exports.getRoomById = async (req, res) => {
    try {
        const { id } = req.params;

        const room = await Room.findById(id)
            .populate('post', 'title overviewDescription status createdAt')
            .populate('user', 'username email phone');

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy phòng trọ'
            });
        }

        // Format data để phù hợp với frontend
        const formattedRoom = {
            id: room._id.toString(),
            postId: room.post?._id?.toString() || null,
            title: room.post?.title || 'Không có tiêu đề',
            price: room.price,
            unit: room.unit,
            area: room.area,
            roomType: room.roomType,
            address: room.address,
            city: room.province,
            district: room.district,
            ward: room.ward,
            image: room.images && room.images.length > 0 ? room.images[0] : '/logo512.png',
            images: room.images || [],
            videos: room.videos || [],
            utilities: room.utilities || [],
            additionalCosts: room.additionalCosts || [],
            notes: room.notes || '',
            author: room.user?.username || 'Người đăng',
            phone: room.user?.phone || '',
            email: room.user?.email || '',
            description: room.post?.overviewDescription || '',
            status: room.post?.status || 'pending',
            postedAt: room.post?.createdAt || room.createdAt,
            location: {
                lat: 10.77653, // Default coordinates for HCM
                lng: 106.70098,
                address: `${room.address}, ${room.district}, ${room.province}`
            }
        };

        res.json({
            success: true,
            room: formattedRoom
        });
    } catch (error) {
        console.error('Error fetching room by ID:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy chi tiết phòng trọ',
            error: error.message
        });
    }
};

exports.createPost = async (req, res) => {
    try {
        const reqStart = process.hrtime.bigint();
        const timings = { media: [], contract: [] };
        // logging tối thiểu: chỉ log lỗi ở dưới
        // frontend may send the payload in multiple shapes:
        // 1) { data: JSON.stringify({ form: { ... } }) }  (legacy from some clients)
        // 2) { form: { ... } }                         (direct shape)
        // 3) { ...formFields }                         (direct top-level fields)
        // Be permissive: try to extract a `form` object from these shapes.
        let form = {};
        try {
            if (req.body && typeof req.body === 'object' && req.body.form && typeof req.body.form === 'object') {
                // shape (2)
                form = req.body.form;
            } else if (req.body && typeof req.body === 'object' && typeof req.body.data === 'string') {
                // shape (1) - parse the string
                const parsed = JSON.parse(req.body.data || '{}');
                // parsed might be { form: { ... } } or might be the form itself
                form = (parsed && typeof parsed === 'object') ? (parsed.form || parsed) : {};
            } else if (req.body && typeof req.body === 'object') {
                // shape (3) - assume top-level fields are the form
                form = req.body;
            } else {
                form = {};
            }
        } catch (parseErr) {
            console.error('Failed to parse incoming form payload:', parseErr);
            form = {};
        }

        if (!form || Object.keys(form).length === 0) {
            console.log('Parsed form is empty or missing. Raw req.body:', req.body);
            return res.status(400).json({ success: false, message: 'Missing form data' });
        }

        // DEBUG: log the parsed form for troubleshooting (will appear in server console)
        console.log('Parsed form for createPost:', Object.keys(form).length ? {
            title: form.title,
            overviewDescription: form.overviewDescription,
            category: form.category,
            priceFrom: form.priceFrom,
            area: form.area,
            location: form.location || form.mapLocation || form.fullAddress || null
        } : form);

        // Determine whether this is an invite-roommate post early so we can
        // apply different rules (invite posts are free and limited to one per user)
        const requestedPostTypeEarly = (form.postType || '').toString().trim() || (form.type || '').toString().trim() || '';
        const isInviteEarly = requestedPostTypeEarly.toLowerCase() === 'invite roomate' || !!form.roommatePreferences;

        // If this is NOT an invite post, require that user currently has an active paid package (IsLandor)
        if (!isInviteEarly) {
            try {
                const uid = req.user?.id;
                if (!uid) return res.status(401).json({ success: false, message: 'Unauthorized' });
                const isRec = await IsLandor.findOne({ user: uid });
                const now = new Date();
                if (!isRec || !isRec.expiresAt || isRec.expiresAt < now) {
                    return res.status(403).json({ success: false, message: 'Bạn cần mua gói để sử dụng chức năng đăng bài' });
                }
            } catch (chkErr) {
                console.error('Failed to verify IsLandor for createPost:', chkErr);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
        }

        // kiểm tra các trường bắt buộc (thay đổi theo yêu cầu của bạn)

        // yêu cầu tên địa phương dễ đọc (không phải mã) hoặc một chuỗi địa chỉ đầy đủ
        const required = ['title', 'overviewDescription', 'category', 'priceFrom', 'area', 'province', 'district', 'address'];
        const missing = required.filter(k => {
            const top = form[k];
            const loc = form.location || {};
            if (k === 'province') {
                return !(top || loc.provinceName || loc.province);
            }
            if (k === 'district') {
                return !(top || loc.districtName || loc.district);
            }
            if (k === 'address') {
                return !(top || form.mapLocation || form.fullAddress || loc.detailAddress || loc.address);
            }
            return !(top || loc[k]);
        });
        if (missing.length) {
            // dọn các file tạm nếu có (hỗ trợ req.files là array hoặc object khi dùng upload.fields)
            try {
                if (req.files) {
                    const fs = require('fs');
                    if (Array.isArray(req.files)) {
                        req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) { } });
                    } else {
                        // req.files is an object: { media: [...], contract: [...] }
                        Object.values(req.files).forEach(arr => { if (Array.isArray(arr)) arr.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) { } }); });
                    }
                }
            } catch (cleanupErr) { /* ignore cleanup errors */ }
            return res.status(400).json({ success: false, message: `Missing fields: ${missing.join(', ')}` });
        }

        // when multer.fields used, req.files is object { media: [...], contract: [...] }
        const mediaFiles = (req.files && req.files.media) ? req.files.media : [];
        const contractFiles = (req.files && req.files.contract) ? req.files.contract : [];

        // Enforce single contract: frontend MUST send URL lists only
        // - form.images: array of image URL strings
        // - form.videos: array of video URL strings
        // - form.contractImages: array of contract image URL strings
        // Reject any file bodies (req.files) or legacy mediaUploaded/contractUploaded shapes.
        if ((req.files && (Array.isArray(req.files) ? req.files.length > 0 : Object.values(req.files).some(a => Array.isArray(a) && a.length > 0)))) {
            return res.status(400).json({ success: false, message: 'Server no longer accepts file bodies. Upload files to Cloudinary from the frontend and send URL lists in form.images / form.videos / form.contractImages.' });
        }

        if (Array.isArray(form.mediaUploaded) || Array.isArray(form.contractUploaded)) {
            return res.status(400).json({ success: false, message: 'Legacy metadata shapes (mediaUploaded/contractUploaded) are deprecated. Send arrays of URL strings: form.images, form.videos, form.contractImages.' });
        }

        const imageUrls = Array.isArray(form.images) ? form.images : [];
        const videoUrls = Array.isArray(form.videos) ? form.videos : [];
        const contractUrls = Array.isArray(form.contractImages) ? form.contractImages : [];

        // Validate that arrays contain strings
        const notString = (arr) => arr.some(i => typeof i !== 'string');
        if (notString(imageUrls)) return res.status(400).json({ success: false, message: 'form.images must be an array of URL strings' });
        if (notString(videoUrls)) return res.status(400).json({ success: false, message: 'form.videos must be an array of URL strings' });
        if (notString(contractUrls)) return res.status(400).json({ success: false, message: 'form.contractImages must be an array of URL strings' });

        // We no longer verify Cloudinary resources server-side. Trust the client-provided URL lists.
        const mediaUploaded = [
            ...imageUrls.map(u => ({ url: u, type: 'image' })),
            ...videoUrls.map(u => ({ url: u, type: 'video' }))
        ];
        const contractUploaded = contractUrls.map(u => ({ url: u, type: 'image' }));

        // contractUploaded available for Room creation

        // tạo Post tối giản trước (title, postType, user)
        // If this is an invite-roommate post, ensure only one exists per user
        const requestedPostType = requestedPostTypeEarly;
        const isInvite = isInviteEarly;

        // enforce uniqueness: user can only have one active invite-roommate post
        if (isInvite) {
            const existing = await Post.findOne({ user: req.user?.id || form.user, postType: 'invite roomate' });
            if (existing) {
                return res.status(409).json({ success: false, message: 'Người dùng đã có bài đăng tìm bạn cùng phòng' });
            }
        }

        const post = new Post({
            title: form.title || form.name || '',
            postType: isInvite ? 'invite roomate' : (form.postType || 'room_rental'),
            postTier: (form.postTier && ['svip', 'vip', 'normal'].includes(String(form.postTier)) ? String(form.postTier) : 'normal'),
            user: req.user?.id || form.user,
            overviewDescription: form.overviewDescription || form.description || ''
        });

        // If invite type, upsert the user's UserInfo document (create if missing, update if exists)
        if (isInvite) {
            try {
                const UserInfos = require('../models/UserInfo');
                const uid = req.user?.id || form.user;
                const prefs = form.roommatePreferences || {};
                const update = {
                    $set: {
                        // Do not overwrite personal fields here; only set preferences and keep existing personal info
                        interests: Array.isArray(prefs.interests) ? prefs.interests : (prefs.interests ? [prefs.interests] : []),
                        habits: Array.isArray(prefs.habits) ? prefs.habits : (prefs.habits ? [prefs.habits] : []),
                        dislikes: Array.isArray(prefs.dislikes) ? prefs.dislikes : (prefs.dislikes ? [prefs.dislikes] : [])
                    },
                    $setOnInsert: {
                        userId: uid,
                        fullName: null,
                        age: null,
                        gender: null,
                        profession: null
                    }
                };
                const ui = await UserInfos.findOneAndUpdate({ userId: uid }, update, { new: true, upsert: true });
                if (ui) post.userInfo = ui._id;
            } catch (uiErr) {
                console.warn('Failed to upsert userInfo for invite post:', uiErr);
            }
        }

        await post.save();

        // post created

        // Chuẩn hóa một số trường trước khi tạo Room để tránh lỗi validate (ví dụ incoming _id không hợp lệ)
        const sanitizedAdditionalCosts = (Array.isArray(form.additionalCosts) ? form.additionalCosts : []).map(item => {
            // copy và loại bỏ các trường id/_id do client có thể gửi các giá trị không phù hợp với ObjectId
            const copy = Object.assign({}, item);
            if (copy._id) delete copy._id;
            if (copy.id) delete copy.id;
            return copy;
        });

        // tạo Room (chi tiết phòng theo Room schema)
        let room;
        try {
            room = await Room.create({

                // lưu tên dạng có thể đọc được (ưu tiên tên, không phải mã)
                province: form.location?.province || form.location?.city || '',
                district: form.location?.district || '',
                ward: form.location?.wardName || form.location?.ward || '',
                address: form.location?.detailAddress || '',
                roomType: form.roomType || form.category || '',
                price: Number(form.price || form.priceFrom) || 0,
                unit: form.unit || 'VND',
                area: Number(form.area) || 0,
                beds: Number(form.beds) || 0,
                baths: Number(form.baths) || 0,
                utilities: Array.isArray(form.utilities) ? form.utilities : (form.utilities ? [form.utilities] : []),
                additionalCosts: sanitizedAdditionalCosts,
                images: mediaUploaded.filter(f => f.type === 'image').map(f => f.url),
                videos: mediaUploaded.filter(f => f.type === 'video').map(f => f.url),
                contractImages: contractUploaded.map(f => f.url),
                notes: form.notes || '',
                post: post._id,
                user: req.user?.id || form.user
            });




















        } catch (roomErr) {
            console.error('Failed to create Room, rolling back Post:', roomErr);
            // nếu tạo Room thất bại, xóa Post đã tạo trước đó để giữ nhất quán
            try { await Post.findByIdAndDelete(post._id); } catch (delErr) { console.error('Failed to delete post during rollback:', delErr); }
            throw roomErr; // propagate error to outer catch which will cleanup files
        }

        // liên kết room vào post và lưu
        try {
            post.room = room._id;
            await post.save();
        } catch (postSaveErr) {
            console.error('Failed to save Post after Room created, rolling back Room and Post:', postSaveErr);
            // delete the room and the post to maintain atomicity
            try {
                await Room.findByIdAndDelete(room._id);

            } catch (delRoomErr) { console.error('Failed to delete room during rollback:', delRoomErr); }
            try { await Post.findByIdAndDelete(post._id); } catch (delPostErr) { console.error('Failed to delete post during rollback:', delPostErr); }
            throw postSaveErr;
        }

        // room created
        const reqEnd = process.hrtime.bigint();
        const totalMs = Number(reqEnd - reqStart) / 1e6;
        // Tính toán tổng thời gian xử lý
        const uploadTotalMs = (timings.media.reduce((s, x) => s + (x.uploadMs || 0), 0) + timings.contract.reduce((s, x) => s + (x.uploadMs || 0), 0));
        timings.uploadTotalMs = uploadTotalMs;
        timings.totalMs = totalMs;
        // timings collected in response

        return res.status(201).json({ success: true, post, timings });
    } catch (err) {
        console.error('createPost error', err);
        // dọn file tạm khi có lỗi (hỗ trợ req.files là array hoặc object)
        try {
            if (req.files) {
                const fs = require('fs');
                if (Array.isArray(req.files)) {
                    req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) { } });
                } else {
                    Object.values(req.files).forEach(arr => { if (Array.isArray(arr)) arr.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) { } }); });
                }
            }
        } catch (cleanupErr) { /* ignore cleanup errors */ }

        return res.status(500).json({ success: false, message: 'Server error' });
    }
};


// listMyPosts: list posts created by the authenticated user (protected)
// - Purpose: provide a simple, authenticated endpoint for the *current* user to
//   retrieve all their posts. This is convenient for user dashboards and avoids
//   the need for clients to pass the user's id.
// - Response shape: { success: true, posts: [...] }
exports.listMyPosts = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        // Find posts owned by the authenticated user and include the room document
        const posts = await Post.find({ user: userId }).populate('room').sort({ createdAt: -1 });
        return res.json({ success: true, posts });
    } catch (err) {
        console.error('listMyPosts error', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// listMyPosts: list posts created by the authenticated user (protected)
// - Purpose: provide a simple, authenticated endpoint for the *current* user to
//   retrieve all their posts. This is convenient for user dashboards and avoids
//   the need for clients to pass the user's id.
// - Response shape: { success: true, posts: [...] }
exports.listMyPosts = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        // Find posts owned by the authenticated user and include the room document
        const posts = await Post.find({ user: userId }).populate('room').sort({ createdAt: -1 });
        return res.json({ success: true, posts });
    } catch (err) {
        console.error('listMyPosts error', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// list posts by a specific user (public)
exports.listByUser = async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!userId) return res.status(400).json({ success: false, message: 'Missing userId' });

        const { page = 1, limit = 20 } = req.query;
        const q = { user: userId };

        const p = Math.max(1, Number(page) || 1);
        const lim = Math.min(100, Math.max(1, Number(limit) || 20));
        const skip = (p - 1) * lim;

        const [total, posts] = await Promise.all([
            Post.countDocuments(q),
            Post.find(q).populate('room').sort({ createdAt: -1 }).skip(skip).limit(lim)
        ]);

        return res.json({ success: true, posts, total, page: p, limit: lim });
    } catch (err) {
        console.error('listByUser error', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// getPostById: return a single post with populated room and user
exports.getPostById = async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) return res.status(400).json({ success: false, message: 'Missing post id' });

        // Populate userInfo so invite posts can expose roommate preferences
        const post = await Post.findById(id).populate('room').populate('user').populate('userInfo');
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        return res.json({ success: true, post });
    } catch (err) {
        console.error('getPostById error', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// getPostByRoom: find the post that references the given room id
exports.getPostByRoom = async (req, res) => {
    try {
        const roomId = req.params.roomId;
        if (!roomId) return res.status(400).json({ success: false, message: 'Missing room id' });

        // populate userInfo as well
        const post = await Post.findOne({ room: roomId }).populate('room').populate('user').populate('userInfo');
        if (!post) return res.status(404).json({ success: false, message: 'Post not found for room' });

        return res.json({ success: true, post });
    } catch (err) {
        console.error('getPostByRoom error', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// updatePost: update post metadata and associated room (only owner or admin)
exports.updatePost = async (req, res) => {
    try {
        const postId = req.params.id;
        if (!postId) return res.status(400).json({ success: false, message: 'Missing post id' });

        const post = await Post.findById(postId).populate('room');
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        const requesterId = req.user?.id;
        const requesterRole = req.user?.role;
        if (!requesterId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        // Only the owner or admin may update
        if (String(post.user) !== String(requesterId) && requesterRole !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { title, overviewDescription, postType, room: roomFields, postTier, images, videos, contractImages } = req.body || {};

        // Update post fields
        if (typeof title === 'string') post.title = title;
        if (typeof overviewDescription === 'string') post.overviewDescription = overviewDescription;
        if (typeof postType === 'string') post.postType = postType;
        if (typeof postTier === 'string' && ['svip', 'vip', 'normal'].includes(postTier)) post.postTier = postTier;

        // Update room if provided
        if (post.room && roomFields && typeof roomFields === 'object') {
            const RoomModel = require('../models/Room');
            try {
                await RoomModel.findByIdAndUpdate(post.room._id || post.room, roomFields, { new: true });
            } catch (e) {
                console.error('Failed to update room fields:', e);
            }
        }
        // Update room media arrays if provided
        if (post.room && (Array.isArray(images) || Array.isArray(videos) || Array.isArray(contractImages))) {
            const RoomModel = require('../models/Room');
            const roomUpdate = {};
            if (Array.isArray(images)) roomUpdate.images = images;
            if (Array.isArray(videos)) roomUpdate.videos = videos;
            if (Array.isArray(contractImages)) roomUpdate.contractImages = contractImages;
            try {
                await RoomModel.findByIdAndUpdate(post.room._id || post.room, roomUpdate, { new: true });
            } catch (e) {
                console.error('Failed to update room media arrays:', e);
            }
        }

        await post.save();
        const updated = await Post.findById(postId).populate('room').populate('user');
        return res.json({ success: true, post: updated });
    } catch (err) {
        console.error('updatePost error', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// deletePost: delete a post and its linked room (owner or admin)
exports.deletePost = async (req, res) => {
    try {
        const postId = req.params.id;
        if (!postId) return res.status(400).json({ success: false, message: 'Missing post id' });

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        const requesterId = req.user?.id;
        const requesterRole = req.user?.role;
        if (!requesterId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        // Only owner or admin may delete
        if (String(post.user) !== String(requesterId) && requesterRole !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        // If post has a linked room, delete it
        try {
            if (post.room) {
                await Room.findByIdAndDelete(post.room);
            }
        } catch (roomDelErr) {
            console.warn('Warning: failed to delete linked room for post', postId, roomDelErr);
        }

        await Post.findByIdAndDelete(postId);

        return res.json({ success: true, message: 'Post deleted' });
    } catch (err) {
        console.error('deletePost error', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get home page data
exports.getHomeData = async (req, res) => {
    try {
        // Lấy tin nổi bật (postTier = 'svip') - tất cả các phòng có postTier là "svip"
        const featuredPosts = await Post.find({
            postTier: 'svip',

        })
            .populate('room')
            .populate('user', 'username email')
            .sort({ createdAt: -1 });

        // Lấy 4 phòng mới nhất (Vừa mới đăng) - sắp xếp theo thời gian tạo gần nhất
        const latestPosts = await Post.find({

        })
            .populate('room')
            .populate('user', 'username email')
            .sort({ createdAt: -1 })
            .limit(4);

        // Lấy các phòng ở ghép khẩn cấp (postType = 'invite roomate')
        const emergencySharing = await Post.find({
            postType: 'invite roomate',

        })
            .populate('room')
            .populate('user', 'username email')
            .sort({ createdAt: -1 });

        // Format data để phù hợp với frontend
        const formatPostData = (posts) => {
            return posts.map(post => ({
                id: post._id,
                title: post.title,
                author: post.user?.username || 'Người dùng',
                date: new Date(post.createdAt).toLocaleDateString('vi-VN'),
                price: post.room ? `${post.room.price}${post.room.unit}` : 'Chưa cập nhật',
                description: post.overviewDescription || '',
                thumbnail: post.room?.images?.[0] || '',
                contactUrl: `/posts/${post._id}`,
                // Thêm các thông tin khác từ room
                area: post.room?.area || 0,
                roomType: post.room?.roomType || '',
                address: post.room?.address || '',
                province: post.room?.province || '',
                district: post.room?.district || '',
                ward: post.room?.ward || '',
                utilities: post.room?.utilities || [],
                images: post.room?.images || [],
                videos: post.room?.videos || []
            }));
        };

        const response = {
            featuredPosts: formatPostData(featuredPosts),
            latestPosts: formatPostData(latestPosts),
            emergencySharing: formatPostData(emergencySharing)
        };

        return res.status(200).json({
            success: true,
            data: response
        });

    } catch (error) {
        console.error('getHomeData error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// GET /api/posts/latest?limit=8&after=<cursor>&type=<postType>
// Cursor format: createdAtISO::id  (e.g. 2025-11-25T12:00:00.000Z::617...)
// Optional `type` (or `postType`) param filters by postType (case-insensitive).
// Accepts shorthand `invite` -> mapped to stored 'invite roomate'.
exports.getLatestPosts = async (req, res) => {
    try {
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 8));
        const rawAfter = req.query.after ? String(req.query.after) : null;
        let afterDate = null;
        let afterId = null;
        if (rawAfter) {
            const parts = rawAfter.split('::');
            if (parts.length === 2) {
                const d = new Date(parts[0]);
                if (!isNaN(d.getTime())) afterDate = d;
                afterId = parts[1];
            } else {
                const d = new Date(rawAfter);
                if (!isNaN(d.getTime())) afterDate = d;
            }
        }

        const q = {};
        q.status = { $ne: 'rejected' };

        // optional filter by type/postType
        const rawType = (req.query.type || req.query.postType || '').toString().trim();
        if (rawType && rawType.toLowerCase() !== 'all') {

            // Normalize some common shorthands
            const t = rawType.toLowerCase();
            let target = rawType;
            if (t === 'invite' || t === 'invite-roomate' || t === 'invite_roomate' || t === 'invite-roommate' || t === 'invite_roommate') {
                target = 'invite roomate';
            }
            // Use case-insensitive exact match via regex
            const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            q.postType = { $regex: new RegExp('^' + escapeRegExp(String(target)) + '$', 'i') };
        }

        // optional filter by postTier (comma-separated). Example: postTier=svip,vip
        const rawTier = (req.query.postTier || req.query.tier || '').toString().trim();
        if (rawTier) {
            console.log('TÌM THẤY postTier:', rawTier);

            const parts = rawTier.split(',').map(s => s.toString().trim()).filter(Boolean);
            if (parts.length) {
                // allow case-insensitive matching by using regex values in $in
                const regexes = parts.map(p => new RegExp('^' + escapeRegExp(p) + '$', 'i'));
                q.postTier = { $in: regexes };
            }
        } else {
            console.log('KHÔNG TÌM THẤY postTier trong yêu cầu');
        }

        if (afterDate) {
            if (afterId) {
                q.$or = [
                    { createdAt: { $lt: afterDate } },
                    { $and: [{ createdAt: afterDate }, { _id: { $lt: afterId } }] }
                ];
            } else {
                q.createdAt = { $lt: afterDate };
            }
        }

        const posts = await Post.find(q)
            .populate('room')
            .populate('user', 'username email phone')
            .sort({ createdAt: -1 })
            .limit(limit + 1);

        const hasMore = posts.length > limit;

        const sliced = hasMore ? posts.slice(0, limit) : posts;

        const items = sliced.map(post => ({
            id: post._id,
            title: post.title,
            overviewDescription: post.overviewDescription || '',
            postType: post.postType,
            postTier: post.postTier,
            status: post.status,
            createdAt: post.createdAt,
            user: post.user ? { id: post.user._id, username: post.user.username, phone: post.user.phone } : null,
            room: post.room ? {
                id: post.room._id,
                price: post.room.price,
                unit: post.room.unit,
                area: post.room.area,
                roomType: post.room.roomType,
                address: post.room.address,
                province: post.room.province,
                district: post.room.district,
                images: post.room.images || [],
                utilities: post.room.utilities || []
            } : null
        }));

        const nextCursor = (sliced.length > 0) ? `${sliced[sliced.length - 1].createdAt.toISOString()}::${sliced[sliced.length - 1]._id}` : null;

        return res.json({ success: true, items, hasMore, nextCursor });
    } catch (err) {
        console.error('getLatestPosts error', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};