const mongoose = require('mongoose');
const Post = require('./models/Post');
const Room = require('./models/Room');
const User = require('./models/Users');

// Kết nối MongoDB
const connectDB = async () => {
    try {
        // Thử kết nối local MongoDB trước
        await mongoose.connect('mongodb://localhost:27017/trochung', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
        });
        console.log('MongoDB connected to local database');
    } catch (error) {
        console.error('MongoDB local connection error:', error.message);
        console.log('Trying to connect to MongoDB Atlas...');
        try {
            // Nếu local không được, thử Atlas
            await mongoose.connect('mongodb+srv://admin:admin123@cluster0.mongodb.net/trochung?retryWrites=true&w=majority', {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000,
            });
            console.log('MongoDB connected to Atlas');
        } catch (atlasError) {
            console.error('MongoDB Atlas connection error:', atlasError.message);
            console.log('Please check your MongoDB connection');
            process.exit(1);
        }
    }
};

// Tạo dữ liệu mẫu
const seedData = async () => {
    try {
        // Tìm hoặc tạo user mẫu
        let user = await User.findOne({ email: 'admin@example.com' });
        if (!user) {
            user = new User({
                username: 'admin',
                email: 'admin@example.com',
                password: 'hashedpassword123', // Trong thực tế cần hash
                role: 'user'
            });
            await user.save();
        }

        // Xóa dữ liệu cũ
        await Post.deleteMany({});
        await Room.deleteMany({});

        // Tạo dữ liệu mẫu
        const sampleData = [
            // Tin nổi bật (postTier = 'svip')
            {
                post: {
                    title: 'Phòng trọ cao cấp gần Đại học Bách Khoa Hà Nội',
                    postType: 'room_rental',
                    postTier: 'svip',
                    overviewDescription: 'Phòng 25m², đầy đủ nội thất (giường, tủ, điều hòa, máy giặt). Gần trung tâm, an ninh 24/7, có chỗ để xe, vào ở ngay.',
                    status: 'approved'
                },
                room: {
                    roomType: 'Phòng trọ',
                    price: 3.2,
                    unit: 'triệu/tháng',
                    area: 25,
                    province: 'Hà Nội',
                    district: 'Hai Bà Trưng',
                    ward: 'Bạch Đằng',
                    address: 'Số 1 Đại Cồ Việt',
                    utilities: ['wifi', 'điều hòa', 'máy giặt', 'bảo vệ'],
                    images: ['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2'],
                    videos: [],
                    contractImages: [],
                    notes: 'Phòng mới, sạch sẽ'
                }
            },
            {
                post: {
                    title: 'Căn hộ mini full nội thất gần Keangnam',
                    postType: 'room_rental',
                    postTier: 'svip',
                    overviewDescription: 'Studio mới, gần Keangnam, thẻ từ, thang máy, camera 24/7.',
                    status: 'approved'
                },
                room: {
                    roomType: 'Studio',
                    price: 8.0,
                    unit: 'triệu/tháng',
                    area: 28,
                    province: 'Hà Nội',
                    district: 'Cầu Giấy',
                    ward: 'Yên Hòa',
                    address: 'Dương Đình Nghệ',
                    utilities: ['wifi', 'điều hòa', 'thang máy', 'bảo vệ', 'thẻ từ'],
                    images: ['https://images.unsplash.com/photo-1600607686527-6f7b9c9c9cf2'],
                    videos: [],
                    contractImages: [],
                    notes: 'Căn hộ cao cấp'
                }
            },
            {
                post: {
                    title: 'Phòng trọ yên tĩnh tại Quận Bình Thạnh, TP.HCM',
                    postType: 'room_rental',
                    postTier: 'svip',
                    overviewDescription: 'Phòng 30m², có ban công, toilet riêng, bếp nấu ăn, khu dân cư an ninh, gần bến xe bus, tiện di chuyển ra trung tâm.',
                    status: 'approved'
                },
                room: {
                    roomType: 'Phòng trọ',
                    price: 4.0,
                    unit: 'triệu/tháng',
                    area: 30,
                    province: 'TP. HCM',
                    district: 'Bình Thạnh',
                    ward: 'Phường 1',
                    address: 'Đường Điện Biên Phủ',
                    utilities: ['wifi', 'điều hòa', 'bếp', 'ban công'],
                    images: ['https://images.unsplash.com/photo-1600607686527-6f7b9c9c9cf2'],
                    videos: [],
                    contractImages: [],
                    notes: 'Phòng yên tĩnh'
                }
            },
            // Vừa mới đăng (4 phòng mới nhất)
            {
                post: {
                    title: 'Phòng trọ mini mới xây, Quận Cầu Giấy',
                    postType: 'room_rental',
                    postTier: 'normal',
                    overviewDescription: 'Phòng mới 100%, có điều hòa, máy nước nóng, thang máy. Miễn phí internet, điện nước theo giá nhà nước.',
                    status: 'approved'
                },
                room: {
                    roomType: 'Phòng trọ',
                    price: 3.0,
                    unit: 'triệu/tháng',
                    area: 20,
                    province: 'Hà Nội',
                    district: 'Cầu Giấy',
                    ward: 'Dịch Vọng',
                    address: 'Nguyễn Khánh Toàn',
                    utilities: ['wifi', 'điều hòa', 'thang máy'],
                    images: ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c'],
                    videos: [],
                    contractImages: [],
                    notes: 'Phòng mới xây'
                }
            },
            {
                post: {
                    title: 'Cho thuê phòng full nội thất gần ĐH Công Nghiệp TP.HCM',
                    postType: 'room_rental',
                    postTier: 'normal',
                    overviewDescription: 'Phòng rộng 28m², có giường, tủ, tivi, tủ lạnh. Giờ giấc linh hoạt, khu vực an ninh tốt, gần siêu thị Coopmart.',
                    status: 'approved'
                },
                room: {
                    roomType: 'Phòng trọ',
                    price: 3.5,
                    unit: 'triệu/tháng',
                    area: 28,
                    province: 'TP. HCM',
                    district: 'Quận 10',
                    ward: 'Phường 15',
                    address: 'Lý Thường Kiệt',
                    utilities: ['wifi', 'điều hòa', 'tivi', 'tủ lạnh'],
                    images: ['https://images.unsplash.com/photo-1600585154154-95320a1ccf93'],
                    videos: [],
                    contractImages: [],
                    notes: 'Full nội thất'
                }
            },
            {
                post: {
                    title: 'Phòng trọ bình dân tại Thủ Dầu Một, Bình Dương',
                    postType: 'room_rental',
                    postTier: 'normal',
                    overviewDescription: 'Phòng khép kín, sạch sẽ, có sân phơi, bếp riêng. Gần KCN VSIP 1, thuận tiện cho công nhân viên thuê dài hạn.',
                    status: 'approved'
                },
                room: {
                    roomType: 'Phòng trọ',
                    price: 2.2,
                    unit: 'triệu/tháng',
                    area: 18,
                    province: 'Bình Dương',
                    district: 'Thủ Dầu Một',
                    ward: 'Phú Hòa',
                    address: 'Đường 30/4',
                    utilities: ['wifi', 'bếp', 'sân phơi'],
                    images: ['https://images.unsplash.com/photo-1613977257362-1de9b3fef88d'],
                    videos: [],
                    contractImages: [],
                    notes: 'Phòng bình dân'
                }
            },
            {
                post: {
                    title: 'Căn hộ mini ban công thoáng, gần chợ Tân Định',
                    postType: 'room_rental',
                    postTier: 'normal',
                    overviewDescription: 'Căn hộ mini full nội thất, có ban công thoáng, thang máy, bãi xe.',
                    status: 'approved'
                },
                room: {
                    roomType: 'Căn hộ mini',
                    price: 6.5,
                    unit: 'triệu/tháng',
                    area: 35,
                    province: 'TP. HCM',
                    district: 'Quận 1',
                    ward: 'Tân Định',
                    address: 'Nguyễn Hữu Cầu',
                    utilities: ['wifi', 'điều hòa', 'thang máy', 'bãi xe', 'ban công'],
                    images: ['https://images.unsplash.com/photo-1600607686527-6f7b9c9c9cf2'],
                    videos: [],
                    contractImages: [],
                    notes: 'Có ban công'
                }
            },
            // Ở ghép khẩn cấp (postType = 'invite roomate')
            {
                post: {
                    title: 'Tìm người ở ghép khu Đại học Thương Mại',
                    postType: 'invite roomate',
                    postTier: 'normal',
                    overviewDescription: 'Phòng 25m², hiện có 1 nữ ở, cần thêm 1 bạn ở ghép. Có điều hòa, máy giặt, nấu ăn chung. Ưu tiên sinh viên gọn gàng.',
                    status: 'approved'
                },
                room: {
                    roomType: 'Ở ghép',
                    price: 1.5,
                    unit: 'triệu/người/tháng',
                    area: 25,
                    province: 'Hà Nội',
                    district: 'Cầu Giấy',
                    ward: 'Dịch Vọng',
                    address: 'Phố Trần Đại Nghĩa',
                    utilities: ['wifi', 'điều hòa', 'máy giặt', 'bếp'],
                    images: ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c'],
                    videos: [],
                    contractImages: [],
                    notes: 'Tìm bạn ở ghép'
                }
            },
            {
                post: {
                    title: 'Tìm bạn nam ở ghép khu vực Tân Bình',
                    postType: 'invite roomate',
                    postTier: 'normal',
                    overviewDescription: 'Phòng 30m², sạch sẽ, có toilet riêng, wifi miễn phí. Giờ giấc tự do, gần sân bay và trạm xe bus.',
                    status: 'approved'
                },
                room: {
                    roomType: 'Ở ghép',
                    price: 1.8,
                    unit: 'triệu/người/tháng',
                    area: 30,
                    province: 'TP. HCM',
                    district: 'Tân Bình',
                    ward: 'Phường 1',
                    address: 'Đường Cộng Hòa',
                    utilities: ['wifi', 'điều hòa', 'toilet riêng'],
                    images: ['https://images.unsplash.com/photo-1600585154154-95320a1ccf93'],
                    videos: [],
                    contractImages: [],
                    notes: 'Tìm bạn nam ở ghép'
                }
            },
            {
                post: {
                    title: 'Cần gấp người ở ghép khu Bình Thạnh, TP.HCM',
                    postType: 'invite roomate',
                    postTier: 'normal',
                    overviewDescription: 'Phòng đầy đủ nội thất, hiện có 2 người, cần thêm 1 bạn. Ưu tiên người đi làm, sạch sẽ, hòa đồng.',
                    status: 'approved'
                },
                room: {
                    roomType: 'Ở ghép',
                    price: 2.0,
                    unit: 'triệu/người/tháng',
                    area: 35,
                    province: 'TP. HCM',
                    district: 'Bình Thạnh',
                    ward: 'Phường 1',
                    address: 'Đường Điện Biên Phủ',
                    utilities: ['wifi', 'điều hòa', 'máy giặt', 'bếp'],
                    images: ['https://images.unsplash.com/photo-1613977257362-1de9b3fef88d'],
                    videos: [],
                    contractImages: [],
                    notes: 'Cần gấp người ở ghép'
                }
            },
            {
                post: {
                    title: 'Ở ghép nữ, phòng rộng rãi, giờ giấc tự do',
                    postType: 'invite roomate',
                    postTier: 'normal',
                    overviewDescription: 'Tìm 1 bạn nữ ở ghép, phòng rộng, có máy lạnh, gần trung tâm.',
                    status: 'approved'
                },
                room: {
                    roomType: 'Ở ghép',
                    price: 1.6,
                    unit: 'triệu/người/tháng',
                    area: 25,
                    province: 'TP. HCM',
                    district: 'Quận 3',
                    ward: 'Phường 1',
                    address: 'Cách Mạng Tháng Tám',
                    utilities: ['wifi', 'điều hòa', 'máy giặt'],
                    images: ['https://images.unsplash.com/photo-1600607686527-6f7b9c9c9cf2'],
                    videos: [],
                    contractImages: [],
                    notes: 'Tìm bạn nữ ở ghép'
                }
            }
        ];

        // Tạo posts và rooms
        for (const item of sampleData) {
            // Tạo Post
            const post = new Post({
                ...item.post,
                user: user._id
            });
            await post.save();

            // Tạo Room
            const room = new Room({
                ...item.room,
                post: post._id,
                user: user._id
            });
            await room.save();

            // Cập nhật Post với Room reference
            post.room = room._id;
            await post.save();

            console.log(`Created post: ${post.title}`);
        }

        console.log('Sample data created successfully!');
        console.log(`Created ${sampleData.length} posts with rooms`);

    } catch (error) {
        console.error('Error seeding data:', error);
    } finally {
        mongoose.connection.close();
    }
};

// Chạy script
const runSeed = async () => {
    await connectDB();
    await seedData();
};

runSeed();
