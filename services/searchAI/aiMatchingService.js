const { GoogleGenAI } = require('@google/genai');

/**
 * AI Matching Service - Sử dụng Google Gemini để phân tích và sắp xếp kết quả tìm kiếm
 * @param {Array} rooms - Mảng rooms đã được lọc cơ bản
 * @param {String} textSearchAI - Text mô tả yêu cầu tìm kiếm của người dùng
 * @returns {Promise<Object>} - { success, rooms, message }
 */
async function matchRoomsWithAI(rooms, textSearchAI) {
    try {
        console.log('🤖 [AI Service] Starting AI matching with', rooms.length, 'rooms');
        console.log('🤖 [AI Service] Search query:', textSearchAI);

        // Validate input
        if (!rooms || rooms.length === 0) {
            return {
                success: true,
                rooms: [],
                message: 'Không có phòng nào phù hợp với bộ lọc cơ bản'
            };
        }

        if (!textSearchAI || textSearchAI.trim().length === 0) {
            return {
                success: true,
                rooms: rooms,
                message: null
            };
        }

        // Initialize Google Gemini AI
        const apiKey = process.env.APIGeminiKey;
        if (!apiKey) {
            console.error('🤖 [AI Service] Missing APIGeminiKey in environment');
            return {
                success: false,
                rooms: rooms,
                message: 'Cấu hình AI chưa sẵn sàng, hiển thị kết quả thông thường'
            };
        }

        const ai = new GoogleGenAI({ apiKey });

        // Chuẩn bị dữ liệu cho AI - gửi TẤT CẢ rooms để AI phân tích
        // AI sẽ chỉ trả về ID của các phòng phù hợp, giúp tiết kiệm token output
        const roomsData = rooms.map((room) => ({
            id: room.id,
            title: room.title,
            description: room.description,
            price: room.price,
            area: room.area,
            roomType: room.roomType,
            address: `${room.address}, ${room.district}, ${room.city}`,
            utilities: room.utilities,
            author: room.author,
            // Thông tin người đăng từ UserInfo - quan trọng cho matching roommate
            authorInfo: {
                interests: room.authorInterests || [], // Sở thích (ví dụ: đọc sách, xem phim, thể thao)
                habits: room.authorHabits || [], // Thói quen (ví dụ: ngủ sớm, dậy sớm, thích sạch sẽ)
                dislikes: room.authorDislikes || [], // Điều không thích (ví dụ: tiếng ồn, hút thuốc)
                bio: room.authorBio || '', // Giới thiệu bản thân
                age: room.authorAge || null, // Tuổi
                gender: room.authorGender || null, // Giới tính (Nam/Nữ/Khác)
                profession: room.authorProfession || '' // Nghề nghiệp
            }
        }));

        // Tạo prompt cho AI - yêu cầu trả về ID và lý do
        const prompt = `Bạn là một chuyên gia tư vấn tìm phòng trọ và tìm bạn cùng phòng. Nhiệm vụ của bạn là phân tích yêu cầu của người dùng và chọn ra các phòng phù hợp nhất.

YÊU CẦU TÌM KIẾM CỦA NGƯỜI DÙNG:
"${textSearchAI}"

DANH SÁCH PHÒNG (${rooms.length} phòng):
${JSON.stringify(roomsData, null, 2)}

GIẢI THÍCH CÁC TRƯỜNG THÔNG TIN NGƯỜI ĐĂNG (authorInfo):
- interests: Sở thích của người đăng (ví dụ: đọc sách, xem phim, thể thao, du lịch, nấu ăn, game)
- habits: Thói quen sinh hoạt (ví dụ: ngủ sớm, dậy sớm, thích sạch sẽ, ngăn nắp, yên tĩnh, hay ra ngoài)
- dislikes: Những điều người đăng không thích/từ chối (ví dụ: tiếng ồn, hút thuốc, nuôi thú cưng, uống rượu, về khuya)
- bio: Giới thiệu bản thân của người đăng
- age: Tuổi của người đăng
- gender: Giới tính (Nam/Nữ/Khác)
- profession: Nghề nghiệp (ví dụ: sinh viên, nhân viên văn phòng, giáo viên)

HƯỚNG DẪN PHÂN TÍCH:
1. Đọc kỹ yêu cầu của người dùng về:
   - Tính cách mong muốn của bạn cùng phòng
   - Thói quen sinh hoạt (ngủ sớm/khuya, sạch sẽ, yên tĩnh...)
   - Sở thích chung có thể chia sẻ
   - Những điều tuyệt đối không chấp nhận (hút thuốc, tiếng ồn...)
   - Yêu cầu về tuổi, giới tính, nghề nghiệp
   - Yêu cầu về phòng (giá, diện tích, tiện ích, vị trí)

2. So sánh với thông tin từng phòng:
   - Thông tin phòng: giá, diện tích, tiện ích, vị trí
   - Mô tả bài đăng
   - Thông tin người đăng (authorInfo): interests, habits, dislikes, bio, age, gender, profession

3. Đánh giá độ tương thích:
   - Sở thích có khớp nhau không? (interests)
   - Thói quen sinh hoạt có hợp nhau không? (habits)
   - Có điều gì xung đột không? (dislikes)
   - Tuổi tác, giới tính, nghề nghiệp có phù hợp không?

4. Chọn các phòng phù hợp nhất và sắp xếp từ tốt nhất đến ít phù hợp hơn

KẾT QUẢ TRẢ VỀ (chỉ JSON array, KHÔNG thêm markdown, KHÔNG giải thích):
[
  {
    "id": "<id của phòng>",
    "reason": "<lý do ngắn gọn tại sao phù hợp, nêu rõ về tính cách/thói quen/sở thích>"
  }
]

Chú ý: 
- Chỉ trả về mảng JSON các phòng phù hợp
- Sắp xếp theo thứ tự phù hợp giảm dần
- Lý do phải cụ thể về tính cách, thói quen, sở thích, không chỉ nói về vị trí
- Nếu không có phòng nào phù hợp, trả về mảng rỗng []`;



        console.log('🤖 [AI Service] Sending request to Gemini...');

        // Gọi API Gemini - chỉ dùng models thực sự tồn tại trong v1beta
        let result = null;
        const modelsToTry = [
            'gemini-1.5-flash',        // Model cơ bản nhất, có free tier
            'gemini-2.5-flash',        // Mới hơn, có thể hết quota
            'gemini-2.0-flash-exp',    // Experimental
            'gemini-1.5-pro'           // Pro version, tốn quota hơn
        ];

        let lastError = null;
        let modelSucceeded = false;

        console.log('🤖 [AI Service] Note: Free tier has limited quota. Consider enabling billing for production use.');

        for (const modelName of modelsToTry) {
            try {
                console.log(`🤖 [AI Service] Trying model: ${modelName}`);
                result = await ai.models.generateContent({
                    model: modelName,
                    contents: prompt
                });
                console.log(`🤖 [AI Service] ✅ Success with model: ${modelName}`);
                modelSucceeded = true;
                break;
            } catch (modelError) {
                lastError = modelError;
                const errorMsg = modelError.message || JSON.stringify(modelError);
                console.log(`🤖 [AI Service] ❌ Model ${modelName} failed:`, errorMsg.substring(0, 200));

                // Nếu lỗi 429 (quota), thử model khác ngay
                if (modelError.status === 429) {
                    console.log(`🤖 [AI Service] Quota exceeded for ${modelName}, trying next model...`);
                    continue;
                }

                // Nếu lỗi 404 (not found), thử model khác
                if (modelError.status === 404) {
                    console.log(`🤖 [AI Service] Model ${modelName} not found, trying next model...`);
                    continue;
                }

                // Nếu là model cuối cùng, throw error
                if (modelName === modelsToTry[modelsToTry.length - 1]) {
                    console.error(`🤖 [AI Service] All ${modelsToTry.length} models failed`);
                    throw lastError;
                }
            }
        }

        // Kiểm tra nếu không có model nào thành công
        if (!modelSucceeded || !result) {
            console.error('🤖 [AI Service] All models failed - likely quota exceeded');
            console.error('🤖 [AI Service] Free tier limits: gemini-2.5-flash = 20/day, others limited');
            throw lastError || new Error('All models failed - quota exceeded or API unavailable');
        }

        const text = result.text;

        console.log('🤖 [AI Service] Received response from Gemini');
        console.log('🤖 [AI Service] Raw response:', text.substring(0, 200));

        // Parse kết quả - AI trả về array of {id, reason}
        let matchedRooms;
        try {
            // Loại bỏ markdown code blocks nếu có
            const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            matchedRooms = JSON.parse(cleanText);
        } catch (parseError) {
            console.error('🤖 [AI Service] Failed to parse AI response:', parseError);
            console.error('🤖 [AI Service] Response text:', text);
            return {
                success: false,
                matchedIds: null,
                message: 'AI phân tích không thành công, hiển thị kết quả thông thường'
            };
        }

        // Validate AI result - phải là array
        if (!Array.isArray(matchedRooms)) {
            console.error('🤖 [AI Service] Invalid AI result structure - expected array');
            return {
                success: false,
                matchedIds: null,
                message: 'Kết quả AI không hợp lệ, hiển thị kết quả thông thường'
            };
        }

        // Validate từng item phải có id và reason
        const validMatches = matchedRooms.filter(item => item.id && item.reason);

        if (validMatches.length === 0) {
            console.error('🤖 [AI Service] No valid matches found');
            return {
                success: false,
                matchedIds: null,
                message: 'Không tìm thấy phòng phù hợp với yêu cầu'
            };
        }

        console.log('🤖 [AI Service] Successfully matched', validMatches.length, 'rooms');
        console.log('🤖 [AI Service] Top 3 matches:', validMatches.slice(0, 3).map(r => ({ id: r.id, reason: r.reason.substring(0, 50) })));

        // Trả về array of {id, reason} theo thứ tự AI suggest
        return {
            success: true,
            matchedIds: validMatches, // [{id, reason}, {id, reason}, ...]
            message: null,
            stats: {
                totalRooms: rooms.length,
                matchedRooms: validMatches.length
            }
        };

    } catch (error) {
        console.error('🤖 [AI Service] Error in AI matching:', error);

        // Xử lý lỗi quota cụ thể
        if (error.status === 429) {
            console.error('🤖 [AI Service] Quota exceeded for ALL models.');
            console.error('🤖 [AI Service] Solutions:');
            console.error('  1. Enable billing at: https://console.cloud.google.com/billing');
            console.error('  2. Wait for quota reset (daily limit)');
            console.error('  3. Use different API key');
            return {
                success: false,
                matchedIds: null,
                message: 'API đã vượt giới hạn sử dụng hôm nay. Vui lòng thử lại sau hoặc nâng cấp tài khoản.'
            };
        }

        // Xử lý lỗi model not found
        if (error.status === 404) {
            console.error('🤖 [AI Service] Model not found. Please check model names.');
            return {
                success: false,
                matchedIds: null,
                message: 'Tính năng AI tạm thời không khả dụng. Vui lòng thử lại sau.'
            };
        }

        return {
            success: false,
            matchedIds: null,
            message: 'Đã xảy ra lỗi khi phân tích AI, hiển thị kết quả thông thường'
        };
    }
}

module.exports = {
    matchRoomsWithAI
};
