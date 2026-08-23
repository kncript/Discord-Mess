const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const PREFIX = '.';
const DB_FILE = './database.json';

// Khởi tạo Database
let db = { users: {}, settings: { botActive: true }, admins: [] };
if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (!db.settings) db.settings = { botActive: true };
        if (!db.admins) db.admins = [];
    } catch (e) {
        console.error('Lỗi đọc database, tạo mới...', e);
    }
}

function saveDb() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = { 
            coins: 100, 
            lastDaily: 0, 
            lastFish: 0,
            lastRob: 0,
            lastWork: 0,
            streak: 0,
            pets: [], // Nuôi tối đa 2 pet
            inventory: {
                shieldUntil: 0,
                proRod: false,
                vipCard: false,
                title: "Thành viên mới"
            }
        };
        saveDb();
    }
    const u = db.users[userId];
    if (u.lastDaily === undefined) u.lastDaily = 0;
    if (u.lastFish === undefined) u.lastFish = 0;
    if (u.lastRob === undefined) u.lastRob = 0;
    if (u.lastWork === undefined) u.lastWork = 0;
    if (u.streak === undefined) u.streak = 0;
    if (!u.pets) u.pets = [];
    if (!u.inventory) u.inventory = { shieldUntil: 0, proRod: false, vipCard: false, title: "Thành viên mới" };
    return u;
}

function isAdmin(userId, message) {
    if (message.guild && message.guild.ownerId === userId) return true;
    return db.admins.includes(userId);
}

// Lưu trữ game đoán số tạm thời trong bộ nhớ RAM
const activeGuesses = new Map();

client.once('ready', () => {
    console.log(`Bot Béo Fat Ass đã sẵn sàng hoành tráng dưới tên ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    // Kiểm tra công tắc tắt/bật bot của Chủ Bot
    if (!db.settings.botActive && !message.content.startsWith(`${PREFIX}bot on`)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const user = getUser(message.author.id);

    // ==========================================
    // 1. THÔNG TIN & HỆ THỐNG ()
    // ==========================================
    if (command === 'info') {
        const infoEmbed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('🤖 THÔNG TIN BOT BÉO FAT ASS')
            .setDescription('Con bot giải trí, tài xỉu, nuôi thú cưng và lầy lội nhất server!')
            .addFields(
                { name: '📊 Tổng số thành viên lưu trữ', value: `${Object.keys(db.users).length} người`, inline: true },
                { name: '⚙️ Trạng thái Bot', value: db.settings.botActive ? '🟢 Đang hoạt động' : '🔴 Đang tạm tắt', inline: true }
            )
            .setTimestamp();
        return message.reply({ embeds: [infoEmbed] });
    }

    if (command === 'hello') {
        return message.reply(`👋 Xin chào <@${message.author.id}>! Bot Béo đang hoạt động rất sung sức đây!`);
    }

    if (command === 'help') {
        return message.reply(`📖 Hãy gõ lệnh theo menu hướng dẫn trên ảnh hoặc sử dụng các lệnh kinh tế (\`.bal\`, \`.daily\`), mini-game (\`.xx\`, \`.cauca\`, \`.gai\`, \`.lode\`, \`.doan\`), pet (\`.pet\`) và bàn thờ (\`.bantho\`) nhé!`);
    }

    // ==========================================
    // 2. KINH TẾ & ĐIỂM DANH ()
    // ==========================================
    if (command === 'bal' || command === 'coins' || command === 'vi') {
        const targetUser = message.mentions.users.first() || message.author;
        const targetData = getUser(targetUser.id);
        return message.reply(`💰 Số dư ví của **${targetUser.username}**: **${Number(targetData.coins).toLocaleString('vi-VN')} xu**.`);
    }

    if (command === 'daily') {
        const now = Date.now();
        const cooldown = 24 * 60 * 60 * 1000;

        if (now - user.lastDaily < cooldown) {
            const remainingTime = Math.ceil((cooldown - (now - user.lastDaily)) / (60 * 60 * 1000));
            return message.reply(`⏳ Bạn đã điểm danh rồi! Vui lòng quay lại sau khoảng **${remainingTime} tiếng** nữa.`);
        }

        user.streak += 1;
        let reward = 200 + (user.streak * 20);
        if (user.inventory.vipCard) reward *= 2;

        user.coins += reward;
        user.lastDaily = now;
        saveDb();

        let vipText = user.inventory.vipCard ? ' (✨ Nhân đôi nhờ Thẻ VIP!)' : '';
        return message.reply(`🎉 Điểm danh thành công! Nhận được **${reward} xu** (Streak: ${user.streak} ngày)${vipText}.`);
    }

    if (command === 'top') {
        const sortedUsers = Object.entries(db.users)
            .sort((a, b) => b[1].coins - a[1].coins)
            .slice(0, 10);

        const topEmbed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle('🏆 BẢNG XẾP HẠNG TOP 10 PHÚ HỘI')
            .setTimestamp();

        let desc = '';
        sortedUsers.forEach(([userId, data], index) => {
            desc += `**#${index + 1}** - <@${userId}>: **${Number(data.coins).toLocaleString('vi-VN')} xu**\n`;
        });
        topEmbed.setDescription(desc || 'Chưa có dữ liệu.');
        return message.reply({ embeds: [topEmbed] });
    }

    // ==========================================
    // 3. MINI-GAME & CỜ BẠC ()
    // ==========================================
    // .gai - Quay Gacha ảnh anime (20 xu)
    if (command === 'gai') {
        const cost = 20;
        if (user.coins < cost) return message.reply(`❌ Bạn cần ít nhất **${cost} xu** để quay gacha ảnh anime!`);
        user.coins -= cost;
        saveDb();

        const animeImages = [
            'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500',
            'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=500',
            'https://images.unsplash.com/photo-1563089145-599997674d42?w=500'
        ];
        const randomImg = animeImages[Math.floor(Math.random() * animeImages.length)];

        const gachaEmbed = new EmbedBuilder()
            .setColor(0xFF69B4)
            .setTitle('✨ GACHA ANIME TRỊ GIÁ 20 XU ✨')
            .setImage(randomImg)
            .setFooter({ text: `Số dư còn lại: ${user.coins} xu` });
        return message.reply({ embeds: [gachaEmbed] });
    }

    // .cauca & .caucalist ()
    if (command === 'caucalist') {
        const listEmbed = new EmbedBuilder()
            .setColor(0x1ABC9C)
            .setTitle('🐟 BẢNG GIÁ TRỊ CÁ KHI CÂU')
            .setDescription('• 👞 Chiếc giày rách: **10 xu**\n• 🐟 Cá Chép vàng: **100 xu**\n• 🦈 Cá Mập dữ dằn: **300 xu**\n• 🐳 Cá Voi khổng lồ: **500 xu**\n*(Sở hữu Cần câu siêu cấp trong `.shop` để tăng tỷ lệ trúng cá to!)*');
        return message.reply({ embeds: [listEmbed] });
    }

    if (command === 'cauca' || command === 'fish') {
        const now = Date.now();
        const cooldown = 30 * 1000;
        if (now - user.lastFish < cooldown) {
            const timeLeft = Math.ceil((cooldown - (now - user.lastFish)) / 1000);
            return message.reply(`🎣 Hãy nghỉ ngơi **${timeLeft} giây** nữa mới được thả thính tiếp.`);
        }
        user.lastFish = now;

        const hasProRod = user.inventory.proRod;
        const rand = Math.random() * 100;
        let fishName = '', reward = 0;

        if (hasProRod) {
            if (rand < 25) { fishName = '🐳 Cá Voi khổng lồ'; reward = 500; }
            else if (rand < 55) { fishName = '🦈 Cá Mập dữ dằn'; reward = 300; }
            else if (rand < 85) { fishName = '🐟 Cá Chép vàng'; reward = 100; }
            else { fishName = '👞 Chiếc giày rách'; reward = 10; }
        } else {
            if (rand < 5) { fishName = '🐳 Cá Voi khổng lồ'; reward = 500; }
            else if (rand < 20) { fishName = '🦈 Cá Mập dữ dằn'; reward = 300; }
            else if (rand < 60) { fishName = '🐟 Cá Chép vàng'; reward = 100; }
            else { fishName = '👞 Chiếc giày rách'; reward = 10; }
        }
        user.coins += reward;
        saveDb();
        return message.reply(`🎣 Bạn câu được **${fishName}**, bán đi thu về **${reward} xu**!`);
    }

    // .xx <số xu / all> <tai/xiu> ()
    if (command === 'xx' || command === 'taixiu' || command === 'tx') {
        let betInput = args[0] ? args[0].toLowerCase() : '';
        let choice = args[1] ? args[1].toLowerCase() : '';

        // Đảo vị trí nếu người dùng gõ lệnh `.xx tai all`
        if (['tai', 'xiu'].includes(betInput) && (!['tai', 'xiu'].includes(choice))) {
            const temp = betInput;
            betInput = choice;
            choice = temp;
        }

        let betAmount = 0;
        if (betInput === 'all') {
            betAmount = user.coins;
        } else {
            betAmount = parseInt(betInput);
        }

        if (!['tai', 'xiu'].includes(choice) || isNaN(betAmount) || betAmount <= 0) {
            return message.reply(`Cách dùng: \`${PREFIX}xx <số xu / all> <tai/xiu>\`\nVí dụ: \`${PREFIX}xx 100 tai\` hoặc \`${PREFIX}xx all xiu\``);
        }

        if (user.coins < betAmount) {
            return message.reply(`❌ Bạn không đủ **${betAmount} xu** trong ví!`);
        }

        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const d3 = Math.floor(Math.random() * 6) + 1;
        const sum = d1 + d2 + d3;
        const result = sum >= 11 ? 'tai' : 'xiu';

        if (choice === result) {
            user.coins += betAmount; // Thắng x2 tổng nhận về lời nguyên tiền cược
            saveDb();
            return message.reply(`🎲 Kết quả: \`${d1} - ${d2} - ${d3}\` (Tổng: **${sum}** - **${result.toUpperCase()}**).\n🎉 Bạn đã **THẮNG** và nhận về **${betAmount} xu**! Ví: **${user.coins} xu**.`);
        } else {
            user.coins -= betAmount;
            saveDb();
            return message.reply(`🎲 Kết quả: \`${d1} - ${d2} - ${d3}\` (Tổng: **${sum}** - **${result.toUpperCase()}**).\n😢 Bạn đã **THUA** và mất **${betAmount} xu**! Ví: **${user.coins} xu**.`);
        }
    }

    // .rob @user ()
    if (command === 'rob') {
        const targetUser = message.mentions.users.first();
        if (!targetUser) return message.reply(`Cách dùng: \`${PREFIX}rob @người_dùng\``);
        if (targetUser.id === message.author.id) return message.reply('❌ Không thể tự cướp chính mình!');

        const targetData = getUser(targetUser.id);
        if (targetData.inventory.shieldUntil > Date.now()) {
            return message.reply(`🛡️ <@${targetUser.id}> đang được bảo vệ bởi Khiên chống cướp!`);
        }
        if (targetData.coins < 50) return message.reply('😢 Nạn nhân nghèo quá, tha cho họ đi!');

        const now = Date.now();
        if (now - user.lastRob < 5 * 60 * 1000) {
            return message.reply('⏰ Bạn đang bị truy nã, hãy đợi thêm vài phút nữa.');
        }
        user.lastRob = now;

        if (Math.random() < 0.4) {
            const stolen = Math.floor(Math.random() * (targetData.coins * 0.3)) + 10;
            targetData.coins -= stolen;
            user.coins += stolen;
            saveDb();
            return message.reply(`🦹 Cướp thành công **${stolen} xu** từ <@${targetUser.id}>!`);
        } else {
            user.coins = Math.max(0, user.coins - 50);
            saveDb();
            return message.reply('🚨 Bị phát hiện! Bạn phải đền bù **50 xu**.');
        }
    }

    // .lode <số 00-99> <số xu> ()
    if (command === 'lode') {
        const numberChoice = args[0];
        const betAmount = parseInt(args[1]);

        if (!numberChoice || numberChoice.length !== 2 || isNaN(numberChoice) || isNaN(betAmount) || betAmount <= 0) {
            return message.reply(`Cách dùng: \`${PREFIX}lode <số 00-99> <số xu>\`\nVí dụ: \`${PREFIX}lode 68 50\` (Ăn x70)`);
        }
        if (user.coins < betAmount) return message.reply('❌ Bạn không đủ xu để đánh lô!');

        user.coins -= betAmount;
        const winningNumber = String(Math.floor(Math.random() * 100)).padStart(2, '0');

        if (numberChoice === winningNumber) {
            const prize = betAmount * 70;
            user.coins += prize;
            saveDb();
            return message.reply(`🎰 Kết quả xổ số về: **${winningNumber}**.\n🎉 Chúc mừng bạn đã trúng lô và hốt về **${prize} xu** (x70)!`);
        } else {
            saveDb();
            return message.reply(`🎰 Kết quả xổ số về: **${winningNumber}**.\n😢 Chúc bạn may mắn lần sau, mất toi **${betAmount} xu**.`);
        }
    }

    // .game & .doan <số> ()
    if (command === 'game' || command === 'doan') {
        const guessNum = parseInt(args[0]);
        if (!activeGuesses.has(message.author.id)) {
            // Khởi tạo trò chơi đoán số ng từ 1-10 cho user
            const secret = Math.floor(Math.random() * 10) + 1;
            activeGuesses.set(message.author.id, secret);
            return message.reply(`🎮 Trợ giúp: Bot đã chọn một số từ **1 đến 10**. Hãy đoán bằng lệnh \`${PREFIX}doan <số>\` để nhận thưởng 200 xu!`);
        }

        if (isNaN(guessNum)) return message.reply(`⚠️ Vui lòng nhập số cần đoán. Ví dụ: \`${PREFIX}doan 5\``);

        const secret = activeGuesses.get(message.author.id);
        if (guessNum === secret) {
            activeGuesses.delete(message.author.id);
            user.coins += 200;
            saveDb();
            return message.reply(`🎉 Chính xác! Số bí mật là **${secret}**. Bạn nhận được phần thưởng **200 xu**!`);
        } else if (guessNum < secret) {
            return message.reply('📈 Số bí mật **lớn hơn** số bạn vừa đoán!');
        } else {
            return message.reply('📉 Số bí mật **nhỏ hơn** số bạn vừa đoán!');
        }
    }

    // ==========================================
    // 4. HỆ THỐNG THÚ CƯNG (PET) ()
    // ==========================================
    if (command === 'pet') {
        const subCmd = args[0] ? args[0].toLowerCase() : '';
        const petNameArgs = args.slice(1).join(' ');

        if (subCmd === 'buy') {
            if (!petNameArgs) return message.reply(`Cách dùng: \`${PREFIX}pet buy <tên_pet>\``);
            if (user.pets.length >= 2) return message.reply('⚠️ Bạn đã nuôi tối đa **2 pet** rồi!');
            
            user.pets.push({ name: petNameArgs, level: 1, exp: 0, born: Date.now() });
            saveDb();
            return message.reply(`🐾 Nhận nuôi thành công pet **${petNameArgs}**! Tổng số pet: ${user.pets.length}/2.`);
        }

        if (subCmd === 'feed') {
            if (user.pets.length === 0) return message.reply('❌ Bạn chưa có pet nào để cho ăn!');
            user.pets[0].exp += 20;
            if (user.pets[0].exp >= 100) {
                user.pets[0].level += 1;
                user.pets[0].exp = 0;
            }
            saveDb();
            return message.reply(`🍖 Bạn cho bé pet **${user.pets[0].name}** ăn ngoan ngoãn. Exp hiện tại tăng lên!`);
        }

        if (subCmd === 'work') {
            if (user.pets.length === 0) return message.reply('❌ Bạn không có pet nào để sai đi kiếm xu cả!');
            const now = Date.now();
            if (now - user.lastWork < 3 * 60 * 1000) {
                return message.reply('⏰ Pet của bạn đang mệt, hãy cho chúng nghỉ ngơi 3 phút rồi mới bắt đi làm tiếp.');
            }
            user.lastWork = now;
            const earned = Math.floor(Math.random() * 150) + 50;
            user.coins += earned;
            saveDb();
            return message.reply(`💼 Pet của bạn đã đi làm chăm chỉ và mang về cho chủ nhân **${earned} xu**!`);
        }

        // Xem thông tin pet mặc định
        if (!user.pets || user.pets.length === 0) {
            return message.reply(`🐾 Bạn chưa nuôi pet nào! Dùng lệnh \`${PREFIX}pet buy <tên>\` để nhận nuôi ngay.`);
        }

        const petEmbed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle(`🐾 TRẠI THÚ CƯNG CỦA ${message.author.username.toUpperCase()}`)
            .setDescription(`Bạn đang nuôi **${user.pets.length}/2** bé pet:`);

        user.pets.forEach((p, index) => {
            petEmbed.addFields({
                name: `Pet #${index + 1}: ${p.name}`,
                value: `⭐ Level: **${p.level}**\n📈 Kinh nghiệm: **${p.exp}/100**`,
                inline: false
            });
        });
        return message.reply({ embeds: [petEmbed] });
    }

    // Thêm lệnh tắt bán pet nếu muốn
    if (command === 'sellpet') {
        if (!user.pets || user.pets.length === 0) return message.reply('❌ Không có pet để bán!');
        const sold = user.pets.pop();
        const refund = sold.level * 150;
        user.coins += refund;
        saveDb();
        return message.reply(`🛍️ Đã bán pet **${sold.name}** và thu về **${refund} xu**.`);
    }

    // ==========================================
    // 5. SHOP & TÚI ĐỒ VẬT PHẨM
    // ==========================================
    if (command === 'shop') {
        const shopEmbed = new EmbedBuilder()
            .setColor(0xE67E22)
            .setTitle('🛒 CỬA HÀNG VẬT PHẨM')
            .addFields(
                { name: '🛡️ Khiên bảo vệ (`shield`)', value: 'Giá: **300 xu** (Chống cướp trong 2h)' },
                { name: '🎣 Cần câu siêu cấp (`prorod`)', value: 'Giá: **500 xu** (Vĩnh viễn)' },
                { name: '🎟️ Thẻ VIP Check-in (`vip`)', value: 'Giá: **2000 xu** (Nhân đôi `.daily`)' }
            );
        return message.reply({ embeds: [shopEmbed] });
    }

    if (command === 'buy') {
        const item = args[0] ? args[0].toLowerCase() : '';
        if (item === 'shield') {
            if (user.coins < 300) return message.reply('❌ Không đủ xu.');
            user.coins -= 300;
            user.inventory.shieldUntil = Date.now() + 2 * 3600 * 1000;
            saveDb();
            return message.reply('🛡️ Đã mua Khiên bảo vệ thành công!');
        } else if (item === 'prorod') {
            if (user.coins < 500) return message.reply('❌ Không đủ xu.');
            user.inventory.proRod = true;
            user.coins -= 500;
            saveDb();
            return message.reply('🎣 Đã mua Cần câu siêu cấp!');
        } else if (item === 'vip') {
            if (user.coins < 2000) return message.reply('❌ Không đủ xu.');
            user.inventory.vipCard = true;
            user.coins -= 2000;
            saveDb();
            return message.reply('🎟️ Đã nâng cấp Thẻ VIP!');
        } else {
            return message.reply(`Cách dùng: \`${PREFIX}buy <shield / prorod / vip>\``);
        }
    }

    // ==========================================
    // 6. LỆNH TẠO ẢNH BÀN THỜ (Lý do dưới avatar)
    // ==========================================
    if (command === 'bantho') {
        const targetUser = message.mentions.users.first();
        let reason = args.join(' ').replace(/<@!?\d+>/g, '').trim();

        if (!targetUser || !reason) {
            return message.reply(`Cách dùng: \`${PREFIX}bantho <lý do> @người_dùng\``);
        }

        try {
            const loadingMsg = await message.reply('🕯️ Đang lập bàn thờ trang nghiêm...');
            const canvas = createCanvas(600, 820);
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#1c1410';
            ctx.fillRect(0, 0, 600, 820);
            ctx.strokeStyle = '#d4af37';
            ctx.lineWidth = 8;
            ctx.strokeRect(20, 20, 560, 780);

            const avatarURL = targetUser.displayAvatarURL({ extension: 'png', size: 256 });
            const avatar = await loadImage(avatarURL);

            ctx.fillStyle = '#2d2d2d';
            ctx.fillRect(150, 90, 300, 300);
            ctx.drawImage(avatar, 150, 90, 300, 300);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 4;
            ctx.strokeRect(150, 90, 300, 300);

            // Băng tang
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.moveTo(150, 90); ctx.lineTo(230, 90); ctx.lineTo(150, 170); ctx.fill();

            // Tên và lý do ngay bên dưới avatar
            ctx.font = 'bold 26px sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(`HƯƠNG LINH: ${targetUser.username.toUpperCase()}`, 300, 440);

            ctx.font = 'italic 20px sans-serif';
            ctx.fillStyle = '#e74c3c';
            ctx.fillText(`Lý do: "${reason}"`, 300, 485);

            ctx.font = '24px sans-serif';
            ctx.fillStyle = '#f1c40f';
            ctx.fillText('🕯️   ⚱️   🕯️', 300, 570);

            ctx.font = 'bold 18px sans-serif';
            ctx.fillStyle = '#bdc3c7';
            ctx.fillText('Thành kính phân ưu - Sớm siêu thoát!', 300, 640);

            const buffer = canvas.toBuffer('image/png');
            await loadingMsg.delete().catch(() => {});
            return message.channel.send({
                content: `🪦 Chia buồn cùng <@${targetUser.id}> vì tội **${reason}**!`,
                files: [{ attachment: buffer, name: 'bantho.png' }]
            });
        } catch (err) {
            console.error(err);
            return message.reply('❌ Lỗi tạo ảnh bàn thờ!');
        }
    }

    // ==========================================
    // 7. QUẢN TRỊ (ADMIN) & CHỦ BOT ()
    // ==========================================
    // Lệnh .xu add / sub / reset @user ()
    if (command === 'xu') {
        if (!isAdmin(message.author.id, message)) return message.reply('❌ Bạn không có quyền Admin!');
        const action = args[0] ? args[0].toLowerCase() : '';
        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[2]);

        if (action === 'reset') {
            if (!targetUser) return message.reply(`Cách dùng: \`${PREFIX}xu reset @user\``);
            const targetData = getUser(targetUser.id);
            targetData.coins = 0;
            saveDb();
            return message.reply(`🔄 Đã reset số dư của <@${targetUser.id}> về 0 xu.`);
        }

        if (!['add', 'sub'].includes(action) || !targetUser || isNaN(amount)) {
            return message.reply(`Cách dùng: \`${PREFIX}xu <add/sub> @user <số_xu>\` hoặc \`${PREFIX}xu reset @user\``);
        }

        const targetData = getUser(targetUser.id);
        if (action === 'add') targetData.coins += amount;
        if (action === 'sub') targetData.coins = Math.max(0, targetData.coins - amount);
        saveDb();

        return message.reply(`✅ Đã cập nhật ví của <@${targetUser.id}>. Số dư mới: **${targetData.coins} xu**.`);
    }

    // .clear <số> ()
    if (command === 'clear') {
        if (!isAdmin(message.author.id, message)) return message.reply('❌ Thiếu quyền!');
        const count = parseInt(args[0]);
        if (isNaN(count) || count < 1 || count > 100) return message.reply('⚠️ Nhập số lượng tin nhắn từ 1 đến 100.');
        await message.channel.bulkDelete(count + 1, true).catch(() => {});
    }

    // .ban / .unban ()
    if (command === 'ban') {
        if (!message.member.permissions.has('BanMembers')) return message.reply('❌ Bạn không có quyền ban thành viên.');
        const member = message.mentions.members.first();
        if (!member) return message.reply(`Cách dùng: \`${PREFIX}ban @user\``);
        await member.ban().then(() => message.reply(`🔨 Đã ban thành công ${member.user.tag}`)).catch(() => message.reply('❌ Không thể ban người này.'));
    }

    if (command === 'unban') {
        if (!message.member.permissions.has('BanMembers')) return message.reply('❌ Thiếu quyền.');
        const userId = args[0];
        if (!userId) return message.reply(`Cách dùng: \`${PREFIX}unban <ID>\``);
        await message.guild.members.unban(userId).then(() => message.reply(`✅ Đã unban ID ${userId}`)).catch(() => message.reply('❌ Không tìm thấy ID bị ban.'));
    }

    // .mute / .unmute ()
    if (command === 'mute') {
        if (!message.member.permissions.has('ModerateMembers')) return message.reply('❌ Thiếu quyền.');
        const member = message.mentions.members.first();
        if (!member) return message.reply(`Cách dùng: \`${PREFIX}mute @user\``);
        // TimeOut mặc định 10 phút
        await member.timeout(10 * 60 * 1000, 'Vi phạm quy định server').then(() => message.reply(`🔇 Đã mute ${member.user.tag} trong 10 phút.`)).catch(() => message.reply('❌ Lỗi timeout.'));
    }

    if (command === 'unmute') {
        if (!message.member.permissions.has('ModerateMembers')) return message.reply('❌ Thiếu quyền.');
        const member = message.mentions.members.first();
        if (!member) return message.reply(`Cách dùng: \`${PREFIX}unmute @user\``);
        await member.timeout(null).then(() => message.reply(`🔊 Đã gỡ mute cho ${member.user.tag}`)).catch(() => message.reply('❌ Lỗi.'));
    }

    // Chủ bot tối cao: .bot off / .bot on ()
    if (command === 'bot') {
        if (message.author.id !== message.guild.ownerId && !db.admins.includes(message.author.id)) {
            return message.reply('👑 Chỉ Chủ Bot hoặc Admin tối cao mới dùng được lệnh này!');
        }
        const action = args[0] ? args[0].toLowerCase() : '';
        if (action === 'off') {
            db.settings.botActive = false;
            saveDb();
            return message.reply('🔴 Đã tạm tắt bot hệ thống!');
        } else if (action === 'on') {
            db.settings.botActive = true;
            saveDb();
            return message.reply('🟢 Đã bật lại bot hoạt động bình thường!');
        }
    }

    // .admin add/remove @user ()
    if (command === 'admin') {
        if (message.author.id !== message.guild.ownerId) return message.reply('👑 Chỉ Chủ Server (Owner) mới có quyền phân quyền Admin bot!');
        const action = args[0] ? args[0].toLowerCase() : '';
        const targetUser = message.mentions.users.first();
        if (!['add', 'remove'].includes(action) || !targetUser) {
            return message.reply(`Cách dùng: \`${PREFIX}admin add @user\` hoặc \`${PREFIX}admin remove @user\``);
        }

        if (action === 'add') {
            if (!db.admins.includes(targetUser.id)) db.admins.push(targetUser.id);
            saveDb();
            return message.reply(`👑 Đã thêm <@${targetUser.id}> vào danh sách Quản trị viên Bot.`);
        } else {
            db.admins = db.admins.filter(id => id !== targetUser.id);
            saveDb();
            return message.reply(`🗑️ Đã xóa quyền Quản trị viên Bot của <@${targetUser.id}>.`);
        }
    }
});

// Điền Token Discord Bot của bạn vào đây
client.login('YOUR_BOT_TOKEN');