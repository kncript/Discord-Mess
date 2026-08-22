const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const folderPath = './videos'; // Thư mục chứa 200 video của bạn

async function uploadVideos() {
    if (!fs.existsSync(folderPath)) {
        console.log(`Không tìm thấy thư mục ${folderPath}! Hãy tạo thư mục tên là 'videos' và bỏ video vào đó.`);
        return;
    }

    const files = fs.readdirSync(folderPath);
    const videoLinks = [];

    console.log(`🚀 Bắt đầu quét và upload ${files.length} video lên mạng... Quá trình này có thể mất vài phút tùy thuộc vào dung lượng.`);

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.join(folderPath, file);
        
        if (fs.lstatSync(filePath).isFile()) {
            try {
                console.log(`⏳ Đang upload [${i + 1}/${files.length}]: ${file}...`);
                const form = new FormData();
                form.append('reqtype', 'fileupload');
                form.append('fileToUpload', fs.createReadStream(filePath));

                const response = await axios.post('https://catbox.moe/user/api.php', form, {
                    headers: form.getHeaders(),
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                });

                if (response.data) {
                    const directUrl = response.data.trim();
                    videoLinks.push(directUrl);
                    console.log(`✅ Xong: ${file} -> ${directUrl}`);
                }
            } catch (err) {
                console.log(`❌ Lỗi upload file: ${file}`);
            }
        }
    }

    console.log('\n==================================================');
    console.log('🎉 ĐÃ UPLOAD XONG TOÀN BỘ VIDEO!');
    console.log('📋 Copy toàn bộ đoạn dưới đây dán vào mảng `videoList` trong bot:');
    console.log('==================================================\n');
    console.log(JSON.stringify(videoLinks, null, 2));
}

uploadVideos();