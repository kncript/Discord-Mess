const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');

// Cấu hình ID kênh chat theo yêu cầu
const UPDATE_CHANNEL_ID = "1540977738951819335";    // Kênh thông báo Update Bot[cite: 1]
const MARRIAGE_CHANNEL_ID = "1541003782492528740";  // Kênh thông báo Kết Hôn[cite: 1]
const ADMIN_LOG_CHANNEL_ID = "1541004363617533953"; // Kênh thông báo Admin phạt/ban[cite: 1]
const NSFW_CHANNEL_ID = "1541006208390139947";      // Kênh riêng cho lệnh NSFW

// 1. Khởi tạo Express server (giữ bot online 24/7 trên Render)[cite: 1]
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Bot đang hoạt động!');
});

app.listen(PORT, () => {
    console.log(`Web server đang chạy trên cổng ${PORT}`);
});

// 2. Kết nối MongoDB Atlas[cite: 1]
const mongoURI = process.env.MONGO_URI;

if (mongoURI) {
    mongoose.connect(mongoURI)
        .then(() => console.log('✅ Đã kết nối thành công với MongoDB Atlas!'))
        .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));
} else {
    console.log('⚠️ Không tìm thấy biến MONGO_URI trong môi trường!');
}

// Khởi tạo Mongoose Schema & Model lưu trữ dữ liệu người dùng[cite: 1]
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    coins: { type: Number, default: 50000 }, 
    bank: { type: Number, default: 0 },
    lastBankInterest: { type: Number, default: Date.now() },
    lastDaily: { type: Number, default: 0 },
    lastFish: { type: Number, default: 0 },
    lastRob: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    pet: {
        type: Object,
        default: null
    },
    marriage: { type: String, default: null },
    company: {
        type: Object,
        default: null
    }
});

const User = mongoose.model('User', userSchema);

// Schema lưu trữ cấu hình chung (admins và phiên bản bot)[cite: 1]
const configSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    admins: { type: Array, default: [] },
    botVersion: { type: Number, default: 1.000 }
});
const Config = mongoose.model('Config', configSchema);

async function getUser(userId) {
    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId });
        await user.save();
    } else {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const hoursPassed = Math.floor((now - user.lastBankInterest) / oneHour);
        
        if (hoursPassed > 0 && user.bank > 0) {
            let interestEarned = 0;
            let currentBank = user.bank;
            for (let i = 0; i < hoursPassed; i++) {
                interestEarned += Math.floor(currentBank * 0.1);
                currentBank += Math.floor(currentBank * 0.1);
            }
            user.bank = currentBank;
            user.lastBankInterest = now - ((now - user.lastBankInterest) % oneHour);
            await user.save();
        }
    }
    return user;
}

async function getConfig() {
    let config = await Config.findOne({ key: 'global_config' });
    if (!config) {
        config = new Config({ key: 'global_config', admins: [], botVersion: 1.000 });
        await config.save();
    }
    return config;
}

// 3. Khởi tạo Discord Client[cite: 1]
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

let isBotActive = true; 

async function isAdmin(userId, member) {
    const OWNER_ID = "950579308051697725"; 
    if (userId === OWNER_ID) return true;
    
    const config = await getConfig();
    if (config.admins.includes(userId)) return true;
    if (member && member.permissions.has('Administrator')) return true;
    
    return false;
}

client.once('ready', async () => {
    console.log(`Bot đã sẵn sàng! Đăng nhập với tên: ${client.user.tag}`);

    // Tự động cập nhật tên Voice Channel đếm số thành viên mỗi 5 phút
    setInterval(async () => {
        const guild = client.guilds.cache.get("1216354495508910110");
        if (!guild) return;

        const channel = guild.channels.cache.get("1541013061169844335");
        if (!channel) return;

        const memberCount = guild.memberCount;
        await channel.setName(`📊 Thành viên: ${memberCount}`).catch(() => {});
    }, 5 * 60 * 1000);

    // Tự động tăng phiên bản bot thêm 0.001 mỗi lần khởi động/update[cite: 1]
    const config = await getConfig();
    config.botVersion = parseFloat((config.botVersion + 0.001).toFixed(3));
    await config.save();

    const versionString = `v${config.botVersion.toFixed(3)}`;

    // Gửi thông báo Update Bot vào kênh cố định[cite: 1]
    if (UPDATE_CHANNEL_ID) {
        try {
            const channel = await client.channels.fetch(UPDATE_CHANNEL_ID);
            if (channel && channel.isTextBased()) {
                const updateEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`🚀 BOT ĐÃ CẬP NHẬT PHIÊN BẢN ${versionString}!`)
                    .setDescription(`Hệ thống vừa được khởi động lại và cập nhật lên bản **${versionString}** thành công.\nGõ \`.menu\` để xem chi tiết!`)
                    .setTimestamp();

                await channel.send({ embeds: [updateEmbed] });
            }
        } catch (err) {
            console.error('Không thể gửi tin nhắn thông báo update:', err);
        }
    }
});

// Chào mừng thành viên mới[cite: 1]
client.on('guildMemberAdd', async member => {
    if (!isBotActive) return;
    const channel = member.guild.systemChannel;
    if (!channel) return;

    const welcomeEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('✨ Chào mừng thành viên mới!')
        .setDescription(`Chào ${member.user.username} đã đến với server! Bạn nhận được **50.000 VNĐ** tiền khởi nghiệp!`)
        .setThumbnail(member.user.displayAvatarURL());
    
    const userData = await getUser(member.id);
    userData.coins += 50000;
    await userData.save();

    channel.send({ embeds: [welcomeEmbed] });
});

client.on('guildMemberRemove', member => {
    if (!isBotActive) return;
    const channel = member.guild.systemChannel;
    if (!channel) return;

    const byeEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('👋 Thành viên rời server')
        .setDescription(`Thành viên **${member.user.username}** đã rời khỏi server.`)
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

    channel.send({ embeds: [byeEmbed] });
});

const secretNumbers = new Map();
const PREFIX = '.'; 

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    const userId = message.author.id;
    const OWNER_ID = "950579308051697725";

    if (message.content === PREFIX + 'bot off') {
        if (userId !== OWNER_ID) return message.reply('❌ Lệnh này chỉ dành riêng cho Chủ Bot Tối Cao!');
        isBotActive = false;
        await message.reply(`💤 Bot đã chuyển sang trạng thái **TẮT**.`);
        return;
    }

    if (message.content === PREFIX + 'bot on') {
        if (userId !== OWNER_ID) return message.reply('❌ Lệnh này chỉ dành riêng cho Chủ Bot Tối Cao!');
        isBotActive = true;
        await message.reply('🟢 Bot đã được **BẬT** trở lại!');
        return;
    }

    if (!isBotActive) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- LỆNH NSFW (CHỈ CHỦ BOT TỐI CAO & KÊNH CHỈ ĐỊNH) ---
    if (command === 'nsfw') {
        if (userId !== OWNER_ID || message.channel.id !== NSFW_CHANNEL_ID) {
            return; 
        }

        const nsfwList = [
            "https://example.com/link-nsfw-1.jpg",
            "https://example.com/link-nsfw-2.jpg",
            "Văn bản hoặc nội dung NSFW tùy chỉnh thứ 3"
        ];

        if (nsfwList.length === 0) {
            return message.reply('⚠️ Danh sách nội dung đang trống!');
        }

        const randomContent = nsfwList[Math.floor(Math.random() * nsfwList.length)];
        return message.reply(randomContent);
    }

    const user = await getUser(userId);

    if (command === 'info') {
        const config = await getConfig();
        const infoEmbed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle('🤖 THÔNG TIN HỆ THỐNG BOT')
            .setDescription(`Phiên bản hiện tại: **v${config.botVersion.toFixed(3)}**\nHệ thống kinh tế chuẩn VNĐ thực tế[cite: 1].\n👑 **Chủ Bot Tối Cao:** <@${OWNER_ID}>\n🌐 **Website Profile:** [Nhấn vào đây](https://hina-long-pfbot.netlify.app/)`)
            .setTimestamp();
        return message.reply({ embeds: [infoEmbed] });
    }

    if (command === 'hello') {
        return message.reply('Chào bạn! Bot đang hoạt động mượt mà với đầy đủ tính năng!');
    }

    if (command === 'help' || command === 'menu') {
        const menuEmbed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle('📖 BẢNG HƯỚNG DẪN LỆNH - BOT BÉO FAT ASS')
            .setDescription(`Dưới đây là danh sách lệnh đầy đủ (sử dụng tiền tố \`${PREFIX}\`):`)
            .addFields(
                { name: 'ℹ️ Thông Tin & Hệ Thống', value: `\`${PREFIX}info\` - Xem thông tin bot\n\`${PREFIX}hello\` - Kiểm tra trạng thái`, inline: false },
                { name: '💰 Kinh Tế, Ngân Hàng & Điểm Danh', value: `\`${PREFIX}coins [@user]\` - Xem ví và ngân hàng\n\`${PREFIX}deposit <số tiền / all>\` - Gửi tiền vào ngân hàng (Lãi 10%/h)\n\`${PREFIX}withdraw <số tiền / all>\` - Rút tiền từ ngân hàng\n\`${PREFIX}daily\` - Điểm danh chuỗi Streak nhận quà\n\`${PREFIX}top\` - Xem bảng xếp hạng`, inline: false },
                { name: '💍 Gia Đình & Công Ty Mới', value: `\`${PREFIX}marry @user\` - Cầu hôn kết hôn\n\`${PREFIX}divorce\` - Ly hôn\n\`${PREFIX}company open <số tiền>\` - Mở công ty (Tối thiểu 10 Tỉ, lãi 200%/h, rủi ro 3% cook/phút)\n\`${PREFIX}company status\` - Kiểm tra công ty\n\`${PREFIX}company claim\` - Rút vốn và chốt lãi`, inline: false },
                { name: '🎲 Mini-Game & Cờ Bạc', value: `\`${PREFIX}gai\` - Gacha ảnh waifu ngẫu nhiên từ kho GitHub (5k VNĐ)\n\`${PREFIX}cauca\` - Quăng mồi câu cá (50k VNĐ)\n\`${PREFIX}caucalist\` - Xem bảng giá trị cá\n\`${PREFIX}xx <số tiền / all> <tai/xiu>\` - Tài Xỉu\n\`${PREFIX}rob @user\` - Cướp tiền\n\`${PREFIX}lode <00-99> <số tiền>\` - Xổ số lô đề\n\`${PREFIX}game\` / \`${PREFIX}doan <số>\` - Trò chơi đoán số`, inline: false },
                { name: '🐾 Hệ Thống Thú Cưng (Pet)', value: `\`${PREFIX}pet buy <tên>\` - Nhận nuôi pet (100k VNĐ)\n\`${PREFIX}pet\` - Xem thông tin pet\n\`${PREFIX}pet feed\` - Cho pet ăn\n\`${PREFIX}pet work\` - Sai pet kiếm tiền\n\`${PREFIX}pet sell\` - Bán pet nhận ngẫu nhiên tới 500k VNĐ`, inline: false },
                { name: '🛠 Quản Trị (Admin)', value: `\`${PREFIX}vnd add <số> @user\` - Bơm tiền\n\`${PREFIX}vnd sub <số> @user\` - Trừ tiền\n\`${PREFIX}clear <số>\` - Xóa tin nhắn\n\`${PREFIX}ban @user [lý do]\` / \`${PREFIX}unban <ID>\`\n\`${PREFIX}mute @user [lý do]\` / \`${PREFIX}unmute @user\``, inline: false },
                { name: '👑 Chủ Bot Tối Cao', value: `\`${PREFIX}bot off\` / \`${PREFIX}bot on\`\n\`${PREFIX}vnd reset @user\`\n\`${PREFIX}admin add/remove @user\``, inline: false }
            )
            .setTimestamp();

        return message.reply({ embeds: [menuEmbed] });
    }

    if (command === 'coins' || command === 'balance') {
        const targetUser = message.mentions.users.first() || message.author;
        const targetData = await getUser(targetUser.id);
        const formattedCoins = Number(targetData.coins).toLocaleString('vi-VN');
        const formattedBank = Number(targetData.bank).toLocaleString('vi-VN');
        
        return message.reply(`💰 Tài khoản của **${targetUser.username}**:\n👛 Tiền mặt trong ví: **${formattedCoins} VNĐ**\n🏦 Tiết kiệm ngân hàng: **${formattedBank} VNĐ**`);
    }

    if (command === 'deposit' || command === 'dep') {
        let amount;
        if (args[0] && args[0].toLowerCase() === 'all') {
            amount = user.coins;
        } else {
            amount = parseInt(args[0]);
        }

        if (isNaN(amount) || amount <= 0) return message.reply(`Cách dùng: \`${PREFIX}deposit <số tiền / all>\``);
        if (user.coins < amount) return message.reply(`❌ Ví không đủ **${amount.toLocaleString('vi-VN')} VNĐ** để gửi!`);

        user.coins -= amount;
        user.bank += amount;
        await user.save();

        return message.reply(`🏦 Gửi thành công **${amount.toLocaleString('vi-VN')} VNĐ** vào ngân hàng!`);
    }

    if (command === 'withdraw' || command === 'with') {
        let amount;
        if (args[0] && args[0].toLowerCase() === 'all') {
            amount = user.bank;
        } else {
            amount = parseInt(args[0]);
        }

        if (isNaN(amount) || amount <= 0) return message.reply(`Cách dùng: \`${PREFIX}withdraw <số tiền / all>\``);
        if (user.bank < amount) return message.reply(`❌ Ngân hàng không có đủ số dư để rút!`);

        user.bank -= amount;
        user.coins += amount;
        await user.save();

        return message.reply(`🏧 Rút thành công **${amount.toLocaleString('vi-VN')} VNĐ** về ví!`);
    }

    if (command === 'daily') {
        const cooldownTime = 24 * 60 * 60 * 1000;
        const streakTimeout = 48 * 60 * 60 * 1000; 
        const now = Date.now();
        const diff = now - user.lastDaily;

        if (diff < cooldownTime) {
            const timeLeft = cooldownTime - diff;
            const hours = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
            return message.reply(`⏳ Đã điểm danh rồi! Quay lại sau **${hours} giờ ${minutes} phút**.`);
        }

        if (user.lastDaily !== 0 && diff > streakTimeout) {
            user.streak = 1; 
        } else {
            user.streak += 1;
        }

        user.lastDaily = now;
        const baseReward = 20000; 
        const streakBonus = Math.min((user.streak - 1) * 10000, 150000); 
        const totalReward = baseReward + streakBonus;

        user.coins += totalReward;
        await user.save();

        return message.reply(`🔥 Điểm danh thành công! Chuỗi Streak: **${user.streak} ngày**.\n🎁 Nhận lương **${totalReward.toLocaleString('vi-VN')} VNĐ**.`);
    }

    if (command === 'top') {
        const topUsers = await User.find().sort({ coins: -1 }).limit(10);
        let text = "🏆 **TOP 10 ĐẠI GIA SERVER (VNĐ):**\n";
        for (let i = 0; i < topUsers.length; i++) {
            const memberObj = await client.users.fetch(topUsers[i].userId).catch(() => ({ username: "Ẩn danh" }));
            const totalWealth = topUsers[i].coins + topUsers[i].bank;
            text += `**${i + 1}.** ${memberObj.username} - Tổng tài sản: **${Number(totalWealth).toLocaleString('vi-VN')} VNĐ**\n`;
        }
        return message.reply(text);
    }

    // --- HỆ THỐNG KẾT HÔN VỚI NÚT BẤM VÀ GỬI KÊNH RIÊNG ---
    if (command === 'marry') {
        const target = message.mentions.users.first();
        if (!target) return message.reply(`Cách dùng: \`${PREFIX}marry @user\``);
        if (target.id === userId) return message.reply('❌ Không thể tự kết hôn với chính mình!');
        if (target.bot) return message.reply('❌ Không thể kết hôn với bot!');

        if (user.marriage) return message.reply('⚠️ Bạn đã có gia đình rồi, muốn cưới người khác phải ly hôn trước!');
        const targetUser = await getUser(target.id);
        if (targetUser.marriage) return message.reply(`❌ **${target.username}** đã có gia đình rồi!`);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('marry_accept').setLabel('Đồng ý ❤️').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('marry_decline').setLabel('Từ chối 💔').setStyle(ButtonStyle.Danger)
        );

        const proposalMsg = await message.reply({
            content: `💍 <@${target.id}>, bạn có nhận được lời cầu hôn từ **${message.author.username}**. Hãy nhấn nút bên dưới trong vòng 30 giây!`,
            components: [row]
        });

        const filter = i => i.user.id === target.id;
        const collector = proposalMsg.createMessageComponentCollector({ filter, time: 30000 });

        collector.on('collect', async i => {
            if (i.customId === 'marry_accept') {
                user.marriage = target.id;
                targetUser.marriage = userId;
                await user.save();
                await targetUser.save();

                await i.update({ content: `🎉 Chúc mừng cặp đôi **${message.author.username}** và **${target.username}** đã chính thức kết hôn! 💒`, components: [] });

                if (MARRIAGE_CHANNEL_ID) {
                    try {
                        const mChannel = await client.channels.fetch(MARRIAGE_CHANNEL_ID);
                        if (mChannel && mChannel.isTextBased()) {
                            await mChannel.send(`🔔 **THÔNG BÁO LỄ CƯỚI:** Chúc mừng <@${message.author.id}> và <@${target.id}> đã chính thức về chung một nhà! 💍✨`);
                        }
                    } catch (err) {
                        console.error('Lỗi gửi kênh kết hôn:', err);
                    }
                }
            } else {
                await i.update({ content: `💔 Rất tiếc, **${target.username}** đã từ chối lời cầu hôn.`, components: [] });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                await proposalMsg.edit({ content: `⏰ Đã quá thời gian 30 giây, lời cầu hôn giữa **${message.author.username}** và **${target.username}** đã hết hiệu lực.`, components: [] }).catch(() => {});
            }
        });
        return;
    }

    if (command === 'divorce') {
        if (!user.marriage) return message.reply('❌ Bạn hiện tại đang độc thân mà!');
        const partnerId = user.marriage;
        const partnerData = await getUser(partnerId);

        user.marriage = null;
        if (partnerData) {
            partnerData.marriage = null;
            await partnerData.save();
        }
        await user.save();
        return message.reply(`📜 Bạn đã ly hôn thành công và chính thức quay lại kiếp độc thân.`);
    }

    // --- HỆ THỐNG MỞ CÔNG TY ---
    if (command === 'company' || command === 'ct') {
        const subAction = args[0] ? args[0].toLowerCase() : '';

        if (subAction === 'open') {
            if (user.company) return message.reply(`⚠️ Bạn đang điều hành một công ty rồi! Dùng \`${PREFIX}company status\` để kiểm tra.`);
            const amount = parseInt(args[1]);
            const MIN_CAPITAL = 10000000000; // 10 Tỉ VNĐ

            if (isNaN(amount) || amount < MIN_CAPITAL) {
                return message.reply(`❌ Số vốn tối thiểu để mở công ty là **10.000.000.000 VNĐ** (10 Tỉ).\nCách dùng: \`${PREFIX}company open <số tiền đầu tư>\``);
            }
            if (user.coins < amount) {
                return message.reply(`❌ Ví của bạn không đủ **${amount.toLocaleString('vi-VN')} VNĐ** để khởi nghiệp!`);
            }

            user.coins -= amount;
            user.company = { invested: amount, startTime: Date.now() };
            await user.save();

            return message.reply(`🏢 Khởi nghiệp thành công với số vốn **${amount.toLocaleString('vi-VN')} VNĐ**!\n⚠️ *Lưu ý:* Mỗi phút công ty hoạt động sẽ có **3% nguy cơ đứt chuỗi vốn và "cook" sạch tiền**, nhưng lãi nhận được là **200% mỗi giờ**! Gõ \`${PREFIX}company claim\` để rút vốn và chốt lãi.`);
        }

        if (subAction === 'status') {
            if (!user.company) return message.reply(`❌ Bạn chưa mở công ty nào cả! Dùng \`${PREFIX}company open <số tiền>\` để bắt đầu.`);
            
            const now = Date.now();
            const minutesPassed = Math.floor((now - user.company.startTime) / (60 * 1000));
            const hoursPassed = (now - user.company.startTime) / (60 * 60 * 1000);
            const potentialProfit = Math.floor(user.company.invested * 2.0 * hoursPassed);
            const totalPotential = user.company.invested + potentialProfit;

            return message.reply(`📊 **THÔNG TIN CÔNG TY CỦA BẠN:**\n` +
                                 `💰 Vốn đầu tư ban đầu: **${user.company.invested.toLocaleString('vi-VN')} VNĐ**\n` +
                                 `⏱️ Thời gian hoạt động: **${minutesPassed} phút** (${hoursPassed.toFixed(2)} giờ)\n` +
                                 `💵 Lợi nhuận dự kiến (200%/h): **+${potentialProfit.toLocaleString('vi-VN')} VNĐ** (Tổng nhận: **${totalPotential.toLocaleString('vi-VN')} VNĐ**)\n` +
                                 `⚠️ Rủi ro sập tiệm: **3% mỗi phút**\n` +
                                 `💡 Gõ \`${PREFIX}company claim\` để rút tiền bất cứ lúc nào!`);
        }

        if (subAction === 'claim') {
            if (!user.company) return message.reply(`❌ Bạn đang không điều hành công ty nào!`);

            const now = Date.now();
            const minutesPassed = Math.floor((now - user.company.startTime) / (60 * 1000));
            
            let isCooked = false;
            for (let i = 0; i < minutesPassed; i++) {
                if (Math.random() < 0.03) {
                    isCooked = true;
                    break;
                }
            }

            if (isCooked) {
                const lostMoney = user.company.invested;
                user.company = null;
                await user.save();
                return message.reply(`💥 **TIN XẤU!** Công ty của bạn đã bất ngờ đứt chuỗi vốn sau ${minutesPassed} phút hoạt động, bị phá sản và **COOK** hoàn toàn! Bạn mất trắng **${lostMoney.toLocaleString('vi-VN')} VNĐ** vốn đầu tư. 📉`);
            }

            const invested = user.company.invested;
            const hoursPassed = (now - user.company.startTime) / (60 * 60 * 1000);
            const profit = Math.floor(invested * 2.0 * hoursPassed);
            const totalReturn = invested + profit; 

            user.coins += totalReturn;
            user.company = null;
            await user.save();

            return message.reply(`🎉 Chốt đơn thành công! Công ty sống sót qua **${minutesPassed} phút**.\n💰 Bạn nhận về vốn lẫn lãi khủng: **${totalReturn.toLocaleString('vi-VN')} VNĐ** vào ví! 🚀`);
        }

        return message.reply(`📖 Hướng dẫn lệnh Công Ty:\n` +
                             `• \`${PREFIX}company open <số tiền>\` - Mở công ty (Tối thiểu 10 tỉ VNĐ, lãi 200%/giờ)\n` +
                             `• \`${PREFIX}company status\` - Xem tình trạng công ty\n` +
                             `• \`${PREFIX}company claim\` - Rút vốn và nhận lãi (Né rủi ro 3% cook mỗi phút)`);
    }

    if (command === 'admin') {
        if (userId !== OWNER_ID) return message.reply('❌ Chỉ Chủ Bot mới có quyền này!');
        const action = args[0];
        const targetUser = message.mentions.users.first();
        if (!targetUser || (action !== 'add' && action !== 'remove')) {
            return message.reply(`Cách dùng: \`${PREFIX}admin add @user\``);
        }

        let config = await getConfig();

        if (action === 'add') {
            if (config.admins.includes(targetUser.id)) return message.reply('Đã là admin từ trước!');
            config.admins.push(targetUser.id);
            await config.save();
            return message.reply(`✅ Đã cấp quyền Admin cho **${targetUser.username}**!`);
        } else if (action === 'remove') {
            const index = config.admins.indexOf(targetUser.id);
            if (index === -1) return message.reply('Không có trong danh sách admin!');
            config.admins.splice(index, 1);
            await config.save();
            return message.reply(`✅ Đã gỡ quyền Admin của **${targetUser.username}**!`);
        }
    }

    if (command === 'vnd' || command === 'xu') {
        const subAction = args[0];
        
        if (subAction === 'reset') {
            if (userId !== OWNER_ID) return message.reply('❌ Chỉ Chủ Bot!');
            const target = message.mentions.users.first();
            if (!target) return message.reply(`Cách dùng: \`${PREFIX}vnd reset @user\``);
            const targetUser = await getUser(target.id);
            targetUser.coins = 0;
            targetUser.bank = 0;
            await targetUser.save();
            return message.reply(`🔄 Đã reset sạch tài sản của **${target.username}**!`);
        }

        if (!await isAdmin(userId, message.member)) return message.reply('❌ Không có quyền Admin!');

        const amount = parseInt(args[1]);
        const target = message.mentions.users.first() || message.author;
        const targetUser = await getUser(target.id);

        if (subAction === 'add') {
            if (isNaN(amount)) return message.reply(`Cách dùng: \`${PREFIX}vnd add <số tiền> @user\``);
            targetUser.coins += amount;
            await targetUser.save();
            return message.reply(`✅ Đã cộng **${amount.toLocaleString('vi-VN')} VNĐ** cho **${target.username}**.`);
        }

        if (subAction === 'sub') {
            if (isNaN(amount) || amount <= 0) return message.reply(`Cách dùng: \`${PREFIX}vnd sub <số tiền> @user\``);
            targetUser.coins = Math.max(0, targetUser.coins - amount);
            await targetUser.save();
            return message.reply(`✅ Đã trừ **${amount.toLocaleString('vi-VN')} VNĐ** của **${target.username}**.`);
        }
    }

    // --- HỆ THỐNG BAN VÀ MUTE KÈM KÊNH LOG ADMIN (`1541004363617533953`) ---
    async function sendAdminLog(adminUser, actionName, targetName, reason) {
        if (!ADMIN_LOG_CHANNEL_ID) return;
        try {
            const logChannel = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID);
            if (logChannel && logChannel.isTextBased()) {
                const logEmbed = new EmbedBuilder()
                    .setColor(0xE74C3C)
                    .setTitle(`🛡️ ADMIN HÀNH ĐỘNG: ${actionName.toUpperCase()}`)
                    .addFields(
                        { name: '👤 Người bị phạt', value: targetName, inline: true },
                        { name: '👮‍♂️ Admin thực hiện', value: `<@${adminUser.id}>`, inline: true },
                        { name: '📝 Lý do', value: reason, inline: false }
                    )
                    .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] });
            }
        } catch (err) {
            console.error('Lỗi gửi log admin:', err);
        }
    }

    if (command === 'ban') {
        if (!await isAdmin(userId, message.member)) return message.reply('❌ Không có quyền!');
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply(`Cách dùng: \`${PREFIX}ban @user [lý do]\``);
        
        const reason = args.slice(1).join(' ') || 'Không có lý do cụ thể';
        try {
            await targetMember.ban({ reason: `Bởi ${message.author.tag} - Lý do: ${reason}` });
            await sendAdminLog(message.author, 'Ban Thành Viên', targetMember.user.tag, reason);
            return message.reply(`🔨 Đã ban **${targetMember.user.username}** với lý do: *${reason}*!`);
        } catch (err) {
            return message.reply('❌ Không đủ quyền ban người này.');
        }
    }

    if (command === 'unban') {
        if (!await isAdmin(userId, message.member)) return message.reply('❌ Không có quyền!');
        const targetId = args[0];
        try {
            await message.guild.members.unban(targetId);
            await sendAdminLog(message.author, 'Unban Thành Viên', `ID: ${targetId}`, 'Gỡ lệnh cấm');
            return message.reply(`✅ Đã gỡ ban cho ID: **${targetId}**!`);
        } catch (err) {
            return message.reply('❌ Không tìm thấy ID.');
        }
    }

    if (command === 'mute') {
        if (!await isAdmin(userId, message.member)) return message.reply('❌ Không có quyền!');
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply(`Cách dùng: \`${PREFIX}mute @user [lý do]\``);
        
        const reason = args.slice(1).join(' ') || 'Không có lý do cụ thể';
        try {
            await targetMember.timeout(24 * 60 * 60 * 1000, `Mute bởi ${message.author.tag} - Lý do: ${reason}`);
            await sendAdminLog(message.author, 'Mute Thành Viên', targetMember.user.tag, reason);
            return message.reply(`🤐 Đã mute **${targetMember.user.username}** trong 24h với lý do: *${reason}*.`);
        } catch (err) {
            return message.reply('❌ Không thể mute.');
        }
    }

    if (command === 'unmute') {
        if (!await isAdmin(userId, message.member)) return message.reply('❌ Không có quyền!');
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply(`Cách dùng: \`${PREFIX}unmute @user\``);
        try {
            await targetMember.timeout(null, 'Unmute');
            await sendAdminLog(message.author, 'Unmute Thành Viên', targetMember.user.tag, 'Gỡ hình phạt mute');
            return message.reply(`✅ Đã gỡ mute **${targetMember.user.username}**.`);
        } catch (err) {
            return message.reply('❌ Lỗi gỡ mute.');
        }
    }

    // --- BẢNG GIÁ CÁ ---
    if (command === 'caucalist' || command === 'listcau') {
        const listEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📖 BẢNG GIÁ HẢI SẢN THỰC TẾ')
            .setDescription(`Phí mua mồi câu mỗi lần (\`${PREFIX}cauca\`) là **50.000 VNĐ**.`)
            .addFields(
                { 
                    name: '🎣 Danh sách thu hoạch', 
                    value: '🗑️ **Chiếc giày rách** - 5.000 VNĐ *(40%)\n' +
                           '🐟 **Cá chép / Cá rô phi** - 50.000 VNĐ *(30%)\n' +
                           '🐠 **Cá hồi tươi** - 200.000 VNĐ *(20%)\n' +
                           '🦈 **Cá mập con** - 1.000.000 VNĐ *(8%)\n' +
                           '🐳 **Cá voi thần thoại** - 5.000.000 VNĐ *(2%)*', 
                    inline: false 
                }
            )
            .setTimestamp();
        return message.reply({ embeds: [listEmbed] });
    }

    if (command === 'cauca') {
        const cost = 50000;
        if (user.coins < cost) return message.reply(`🎣 Cần ít nhất **${cost.toLocaleString('vi-VN')} VNĐ** để mua mồi câu!`);

        user.coins -= cost;

        const fishes = [
            { name: '🗑️ Chiếc giày rách', price: 5000, chance: 40 },
            { name: '🐟 Cá chép / Cá rô phi', price: 50000, chance: 30 },
            { name: '🐠 Cá hồi tươi', price: 200000, chance: 20 },
            { name: '🦈 Cá mập con', price: 1000000, chance: 8 },
            { name: '🐳 Cá voi thần thoại', price: 5000000, chance: 2 }
        ];

        const randomNum = Math.random() * 100;
        let cumulative = 0;
        let caughtFish = fishes[0];

        for (const f of fishes) {
            cumulative += f.chance;
            if (randomNum <= cumulative) {
                caughtFish = f;
                break;
            }
        }

        user.coins += caughtFish.price;
        await user.save();

        return message.reply(`🎣 Bạn câu được: **${caughtFish.name}**! Bán thu về **${caughtFish.price.toLocaleString('vi-VN')} VNĐ**.`);
    }

    if (command === 'gai') {
        const cost = 5000;
        if (user.coins < cost) return message.reply(`Bạn cần **${cost.toLocaleString('vi-VN')} VNĐ** để xem ảnh.`);

        user.coins -= cost;
        await user.save();

        try {
            const loadingMsg = await message.reply('✨ Đang bốc thăm kho ảnh...');
            const githubOwner = 'kncript';
            const repoName = 'Discord-Mess';
            const apiUrl = `https://api.github.com/repos/${githubOwner}/${repoName}/contents`;
            
            const response = await axios.get(apiUrl);
            const imageFiles = response.data.filter(file => file.type === 'file' && /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name));

            if (imageFiles.length === 0) {
                user.coins += cost;
                await user.save();
                return loadingMsg.edit('❌ Không tìm thấy ảnh trên GitHub!');
            }

            const randomImage = imageFiles[Math.floor(Math.random() * imageFiles.length)];
            const imageUrl = randomImage.download_url;

            const gachaEmbed = new EmbedBuilder()
                .setColor(0xFF00FF)
                .setTitle(`✨ Waifu Gacha - ${message.author.username}`)
                .setDescription(`Ví còn lại: **${Number(user.coins).toLocaleString('vi-VN')} VNĐ**`)
                .setImage(imageUrl)
                .setTimestamp();

            return loadingMsg.edit({ content: null, embeds: [gachaEmbed] });
        } catch (error) {
            user.coins += cost;
            await user.save();
            return message.reply('❌ Lỗi kết nối GitHub, đã hoàn lại tiền!');
        }
    }

    if (command === 'xx') {
        let bet;
        let choice;

        if (args[0] && args[0].toLowerCase() === 'all') {
            bet = user.coins;
            choice = args[1] ? args[1].toLowerCase() : '';
        } else {
            bet = parseInt(args[0]);
            choice = args[1] ? args[1].toLowerCase() : '';
        }

        if (isNaN(bet) || bet <= 0) return message.reply(`Cách chơi: \`${PREFIX}xx <số tiền / all> <tai/xiu>\``);
        if (user.coins < bet) return message.reply(`Ví không đủ tiền!`);
        if (choice !== 'tai' && choice !== 'xiu') return message.reply('Vui lòng chọn `tai` hoặc `xiu`!');

        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const d3 = Math.floor(Math.random() * 6) + 1;
        const total = d1 + d2 + d3;
        const result = total >= 11 ? 'tai' : 'xiu';

        if (choice === result) {
            user.coins += bet; 
            await user.save();
            return message.reply(`🎲 Kết quả: **[${d1}] [${d2}] [${d3}]** (${total} - **${result.toUpperCase()}**).\n🎉 Thắng! Nhận **${(bet * 2).toLocaleString('vi-VN')} VNĐ**!`);
        } else {
            user.coins -= bet;
            await user.save();
            return message.reply(`🎲 Kết quả: **[${d1}] [${d2}] [${d3}]** (${total} - **${result.toUpperCase()}**).\n😢 Thua mất **${bet.toLocaleString('vi-VN')} VNĐ**.`);
        }
    }

    if (command === 'rob' || command === 'cuop') {
        const targetMember = message.mentions.users.first();
        if (!targetMember) return message.reply(`Cách dùng: \`${PREFIX}rob @user\``);
        if (targetMember.id === userId) return message.reply('❌ Không thể tự cướp chính mình!');

        const cooldown = 30 * 60 * 1000; 
        const now = Date.now();
        if (now - user.lastRob < cooldown) {
            const timeLeft = Math.ceil((cooldown - (now - user.lastRob)) / (60 * 1000));
            return message.reply(`⏳ Đợi **${timeLeft} phút** nữa.`);
        }

        if (user.coins < 20000) return message.reply('❌ Cần ít nhất **20.000 VNĐ** phí hành sự!');
        const targetUser = await getUser(targetMember.id);
        if (targetUser.coins < 20000) return message.reply(`❌ Mục tiêu quá nghèo!`);

        user.lastRob = now;
        const success = Math.random() < 0.45; 

        if (success) {
            const stolenAmount = Math.floor(Math.random() * (targetUser.coins * 0.3)) + 5000; 
            targetUser.coins -= stolenAmount;
            user.coins += stolenAmount;
            await targetUser.save();
            await user.save();
            return message.reply(`🥷 Cướp thành công **${stolenAmount.toLocaleString('vi-VN')} VNĐ** từ **${targetMember.username}**!`);
        } else {
            const fine = 15000; 
            user.coins = Math.max(0, user.coins - fine);
            await user.save();
            return message.reply(`🚨 Bị công an bắt phạt mất **${fine.toLocaleString('vi-VN')} VNĐ**.`);
        }
    }

    if (command === 'lode' || command === 'xoaso') {
        const choiceNum = args[0];
        const bet = parseInt(args[1]);

        if (!choiceNum || isNaN(bet) || bet <= 0 || choiceNum.length !== 2) {
            return message.reply(`Cách chơi: \`${PREFIX}lode <00-99> <số tiền cược>\``);
        }
        if (user.coins < bet) return message.reply(`Không đủ tiền cược!`);

        user.coins -= bet;
        const winningNum = String(Math.floor(Math.random() * 100)).padStart(2, '0');

        if (choiceNum === winningNum) {
            const reward = bet * 70;
            user.coins += reward;
            await user.save();
            return message.reply(`🎰 Kết quả: **[${winningNum}]**. Trúng lô húp **${reward.toLocaleString('vi-VN')} VNĐ**!`);
        } else {
            await user.save();
            return message.reply(`🎰 Kết quả: **[${winningNum}]**. Xịt lô, mất **${bet.toLocaleString('vi-VN')} VNĐ**!`);
        }
    }

    if (command === 'pet') {
        const subAction = args[0];

        if (subAction === 'buy') {
            if (user.pet) return message.reply(`⚠️ Bạn đã có pet rồi!`);
            const petName = args.slice(1).join(' ');
            const cost = 100000; 
            if (!petName) return message.reply(`Cách dùng: \`${PREFIX}pet buy <tên>\``);
            if (user.coins < cost) return message.reply(`❌ Cần **${cost.toLocaleString('vi-VN')} VNĐ** để mua thú cưng.`);

            user.coins -= cost;
            user.pet = { name: petName, level: 1, exp: 0, lastFed: 0, lastWork: 0 };
            await user.save();
            return message.reply(`🎉 Nhận nuôi thành công pet **${petName}**!`);
        }

        if (!user.pet) return message.reply(`🐾 Bạn chưa có pet! Dùng \`${PREFIX}pet buy <tên>\` (100k VNĐ).`);

        let p = { ...user.pet };

        if (subAction === 'sell') {
            const sellPrice = Math.floor(Math.random() * 490000) + 10000; 
            user.coins += sellPrice;
            const petName = p.name;
            user.pet = null;
            await user.save();
            return message.reply(`💸 Đã bán thú cưng **${petName}** thu về **${sellPrice.toLocaleString('vi-VN')} VNĐ**!`);
        }

        if (subAction === 'feed') {
            const feedCooldown = 4 * 60 * 60 * 1000; 
            const now = Date.now();
            if (now - p.lastFed < feedCooldown) return message.reply(`🍖 Pet vẫn còn no!`);
            p.lastFed = now;
            p.exp += 20;
            if (p.exp >= p.level * 50) {
                p.level += 1;
                p.exp = 0;
                user.pet = p;
                await user.save();
                return message.reply(`🎉 Pet lên **Level ${p.level}**!`);
            }
            user.pet = p;
            await user.save();
            return message.reply(`🍖 Đã cho pet ăn!`);
        }

        if (subAction === 'work') {
            const workCooldown = 1 * 60 * 60 * 1000; 
            const now = Date.now();
            if (now - p.lastWork < workCooldown) return message.reply(`⏳ Pet đang mệt, hãy đợi thêm chút nữa nhé.`);
            p.lastWork = now;
            
            const earned = p.level * 200000 + Math.floor(Math.random() * 150000) + 50000; 
            user.coins += earned;
            user.pet = p;
            await user.save();
            return message.reply(`💼 Pet đi làm về cực chăm chỉ và kiếm về cho bạn **${earned.toLocaleString('vi-VN')} VNĐ**! Tổng ví hiện tại: **${Number(user.coins).toLocaleString('vi-VN')} VNĐ**.`);
        }

        const petEmbed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`🐾 Thú Cưng: ${p.name}`)
            .setDescription(`⭐ **Level:** ${p.level}\n✨ **EXP:** ${p.exp} / ${p.level * 50}\n💡 Gõ \`${PREFIX}pet sell\` để bán pet nhận tới 500.000 VNĐ.`);

        return message.reply({ embeds: [petEmbed] });
    }

    if (command === 'game') {
        const num = Math.floor(Math.random() * 10) + 1;
        secretNumbers.set(message.channel.id, num);
        return message.reply(`🎮 Đã tạo số bí mật từ 1-10. Gõ \`${PREFIX}doan <số>\`!`);
    }

    if (command === 'doan') {
        const currentSecret = secretNumbers.get(message.channel.id);
        if (!currentSecret) return message.reply(`Chưa có game.`);
        const guess = parseInt(args[0]);
        if (isNaN(guess)) return message.reply(`Nhập số hợp lệ!`);

        if (guess === currentSecret) {
            user.coins += 15000;
            await user.save();
            message.reply(`🏆 Chính xác! Nhận **15.000 VNĐ**!`);
            secretNumbers.delete(message.channel.id);
        } else if (guess < currentSecret) {
            return message.reply('📈 Số lớn hơn!');
        } else {
            return message.reply('📉 Số nhỏ hơn!');
        }
    }

    if (command === 'clear') {
        if (!await isAdmin(userId, message.member)) return message.reply('Không có quyền!');
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('Nhập từ 1 đến 100.');
        await message.channel.bulkDelete(amount + 1, true).catch(() => {});
        const notifyMsg = await message.channel.send(`Đã xóa ${amount} tin nhắn!`);
        setTimeout(() => notifyMsg.delete().catch(() => {}), 3000);
        return;
    }
});

client.login(process.env.DISCORD_TOKEN);