
// في أول الملف
require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const dataManager = require('./dataManager.js'); // ⭐ استيراد مدير البيانات

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});
// ⭐ دالة لحساب لون التذكرة حسب مدة الانتظار
function getTicketStatusColor(openedAt) {
    const now = Date.now();
    const waitingTime = now - openedAt;
    const waitingHours = waitingTime / (1000 * 60 * 60);
    
    if (waitingHours < 1) return '#48bb78';
    if (waitingHours < 2) return '#9ae6b4';
    if (waitingHours < 3) return '#fbbf24';
    if (waitingHours < 4) return '#f59e0b';
    if (waitingHours < 5) return '#f97316';
    if (waitingHours < 6) return '#ef4444';
    if (waitingHours < 12) return '#dc2626';
    if (waitingHours < 24) return '#b91c1c';
    return '#000000';
}

// للاختبار (بالدقائق)
function getStatusEmoji(openedAt) {
    const now = Date.now();
    const waitingMinutes = Math.floor((now - openedAt) / (1000 * 60));
    
    if (waitingMinutes < 1) return '🟢';
    if (waitingMinutes < 2) return '🟢🟡';
    if (waitingMinutes < 3) return '🟡';
    if (waitingMinutes < 4) return '🟡🟠';
    if (waitingMinutes < 5) return '🟠';
    if (waitingMinutes < 6) return '🟠🔴';
    if (waitingMinutes < 7) return '🔴';
    if (waitingMinutes < 8) return '🔴🔴';
    if (waitingMinutes < 9) return '🔴⚫';
    if (waitingMinutes < 10) return '⚫🔴';
    return '⚫';
}

// ⭐ إعدادات البوت (سيتم تحميلها من الملف)
let botSettings = {
    mainText: "🏆 **نظام تذاكر الدعم الفني**\n\nاختر قسم الدعم المناسب من القائمة أدناه للحصول على المساعدة من فريقنا المختص.\n\n📌 **نظام تذاكر عائلة العمدة**",
    title: "🎫 نظام تذاكر الدعم الفني",
    color: "#5865F2",
    thumbnail: null,
    banner: null,
    ratingChannel: null,
    logChannel: null,           // اللوجات العامة
    adminLogChannel: null,       // ⭐ قناة لوجات الصلاحيات والأقسام
    allowedRoles: []
};
// ⭐ دالة لاستخراج رتب IDs من النص
function extractRoleIdsFromText(text, guild) {
    if (!text) return [];
    
    const roleIds = new Set();
    
    // استخراج mentions <@&123456789>
    const mentionRegex = /<@&(\d+)>/g;
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
        roleIds.add(match[1]);
    }
    
    // استخراج IDs رقمية
    const idRegex = /\b(\d{17,20})\b/g;
    while ((match = idRegex.exec(text)) !== null) {
        // نتأكد إن الرقم ده فعلاً ID رتبة موجودة
        const role = guild.roles.cache.get(match[1]);
        if (role) {
            roleIds.add(match[1]);
        }
    }
    
    // استخراج أسماء الرتب (لو المستخدم كتب اسم الرتبة)
    const words = text.split(/[\s,،]+/);
    for (const word of words) {
        if (word.length > 1) {
            // بحث عن رتبة بنفس الاسم
            const role = guild.roles.cache.find(r => 
                r.name.toLowerCase() === word.toLowerCase() ||
                r.name.toLowerCase().includes(word.toLowerCase())
            );
            if (role) {
                roleIds.add(role.id);
            }
        }
    }
    
    return Array.from(roleIds);
}
// ⭐ تخزين المحظورين من التذاكر
const bannedUsers = new Map(); // userID -> { reason: string, bannedBy: string, bannedAt: number, duration: number }

// تخزين البيانات
const ticketCategories = new Map();
const activeTickets = new Map();
const closedTickets = new Map();
const ticketCounters = new Map();

// ⭐ إضافة: تخزين التذاكر التي تم حذف قنواتها
const deletedTickets = new Map();

// ⭐ ترستر للدروب داون الرئيسي (5 ثواني)
const dropdownCooldowns = new Map();

// ⭐ لتتبع رسالة الدروب داون الرئيسية
let mainDropdownMessage = null;

const colorMap = {
    "أحمر": "#FF0000", "أخضر": "#00FF00", "أزرق": "#0000FF", "أصفر": "#FFFF00",
    "برتقالي": "#FFA500", "بنفسجي": "#800080", "وردي": "#FFC0CB", "بني": "#8B4513",
    "رمادي": "#808080", "أسود": "#000000", "أبيض": "#FFFFFF", "تركواز": "#40E0D0",
    "ذهبي": "#FFD700", "فضي": "#C0C0C0",
    "red": "#FF0000", "green": "#00FF00", "blue": "#0000FF", "yellow": "#FFFF00",
    "orange": "#FFA500", "purple": "#800080", "pink": "#FFC0CB", "brown": "#8B4513",
    "gray": "#808080", "black": "#000000", "white": "#FFFFFF", "turquoise": "#40E0D0",
    "gold": "#FFD700", "silver": "#C0C0C0"
};


// ⭐ تخزين رسائل التذاكر
const ticketMessages = new Map(); // ticketId -> [messages]
// ⭐ دالة لحفظ نسخة محلية من التذكرة
const fs = require('fs');
const path = require('path');

// ⭐ دالة لإرسال إشعار الإغلاق للمستخدم (حطها هنا)
async function sendTicketToUser(ticket, category, user, closedBy) {
    try {
        console.log(`📤 بدء إرسال إشعار الإغلاق للمستخدم: ${user.tag}`);
        
        // الحصول على وقت الإغلاق الحالي
        const closeTime = new Date();
        const formattedTime = closeTime.toLocaleString('en-US', {
            dateStyle: 'long',
            timeStyle: 'medium'
        });

        // إنشاء رابط النسخة
        const urls = await createTranscriptUrl(ticket, category, closedBy);
        
        // جلب اسم المغلق
        let closedByName = 'غير معروف';
        if (closedBy) {
            try {
                const closedUser = await client.users.fetch(closedBy);
                closedByName = closedUser.username;
            } catch {}
        }
        
        // إرسال إشعار الإغلاق للمستخدم
        const closeEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🔒 تم إغلاق تذكرتك')
            .setDescription(`**${ticket.fullId || ticket.id}**\n\nتم إغلاق تذكرتك`)
            .addFields(
                { name: '📂 القسم', value: ticket.category, inline: true },
                { name: '👨‍💼 تم الإغلاق بواسطة', value: closedByName, inline: true },
                { name: '⏰ وقت الإغلاق', value: formattedTime, inline: true },
                { name: '📝 سبب الإغلاق', value: ticket.closeReason || 'غير محدد', inline: false }
            )
            .setTimestamp(closeTime);

        // ⭐ إرسال طلب التقييم
        const ratingEmbed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('⭐ تقييم الخدمة')
            .setDescription('**كيف تقيم خدمتنا في هذه التذكرة؟**\n\nمن فضلك قم بتقييم خدمتنا من 1 إلى 5 نجوم')
            .addFields(
                { name: '🏷️ التذكرة', value: ticket.fullId || ticket.id, inline: true },
                { name: '📂 القسم', value: ticket.category, inline: true },
                { name: '👨‍💼 المسؤول', value: ticket.claimedByName || 'لم يتم الاستلام', inline: true },
                { name: '👨‍💼 تم الإغلاق بواسطة', value: closedByName, inline: true },
                { name: '⏰ وقت الإغلاق', value: formattedTime, inline: true }
            )
            .setFooter({ text: 'شكراً لك على استخدام خدمتنا' })
            .setTimestamp(closeTime);

        // أزرار التقييم
        const star1 = new ButtonBuilder().setCustomId(`rate_1_${ticket.fullId || ticket.id}`).setLabel('⭐').setStyle(ButtonStyle.Secondary);
        const star2 = new ButtonBuilder().setCustomId(`rate_2_${ticket.fullId || ticket.id}`).setLabel('⭐⭐').setStyle(ButtonStyle.Secondary);
        const star3 = new ButtonBuilder().setCustomId(`rate_3_${ticket.fullId || ticket.id}`).setLabel('⭐⭐⭐').setStyle(ButtonStyle.Secondary);
        const star4 = new ButtonBuilder().setCustomId(`rate_4_${ticket.fullId || ticket.id}`).setLabel('⭐⭐⭐⭐').setStyle(ButtonStyle.Secondary);
        const star5 = new ButtonBuilder().setCustomId(`rate_5_${ticket.fullId || ticket.id}`).setLabel('⭐⭐⭐⭐⭐').setStyle(ButtonStyle.Secondary);
        
        const ratingRow = new ActionRowBuilder().addComponents(star1, star2, star3, star4, star5);
        
        // تحضير الأزرار
        const actionRow = new ActionRowBuilder();
        
        // لو في URLs ناجحة، نضيف أزرار المعاينة والتحميل
        if (urls) {
            const previewButton = new ButtonBuilder()
                .setLabel('👁️ معاينة المحادثة')
                .setStyle(ButtonStyle.Link)
                .setURL(urls.preview)
                .setEmoji('👁️');
                
            const downloadButton = new ButtonBuilder()
                .setLabel('📥 تحميل المحادثة')
                .setStyle(ButtonStyle.Link)
                .setURL(urls.download)
                .setEmoji('📥');
                
            actionRow.addComponents(previewButton, downloadButton);
            
            console.log(`✅ تم إنشاء الروابط بنجاح للمستخدم ${user.tag}`);
            console.log(`👁️ معاينة: ${urls.preview}`);
        } else {
            // لو فشل، نضيف أزرار وهمية معطلة
            const previewButton = new ButtonBuilder()
                .setLabel('👁️ معاينة المحادثة')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👁️')
                .setDisabled(true);
                
            const downloadButton = new ButtonBuilder()
                .setLabel('📥 تحميل المحادثة')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📥')
                .setDisabled(true);
                
            actionRow.addComponents(previewButton, downloadButton);
            
            console.log(`⚠️ تم إرسال أزرار معطلة للمستخدم ${user.tag} (فشل إنشاء الرابط)`);
        }
        
        // إرسال الإشعار مع الأزرار
        try {
            await user.send({ 
                embeds: [closeEmbed],
                components: [actionRow]
            });
            console.log(`✅ تم إرسال إشعار الإغلاق للمستخدم ${user.tag}`);
        } catch (dmError) {
            console.log(`❌ لا يمكن إرسال رسالة خاصة للمستخدم ${user.tag}:`, dmError.message);
            return false;
        }
        
        // إرسال طلب التقييم
        try {
            await user.send({ 
                content: '**📝 من فضلك قم بتقييم خدمتنا:**',
                embeds: [ratingEmbed], 
                components: [ratingRow] 
            });
            console.log(`✅ تم إرسال طلب التقييم للمستخدم ${user.tag}`);
        } catch (dmError) {
            console.log(`❌ لا يمكن إرسال طلب التقييم للمستخدم ${user.tag}:`, dmError.message);
        }

        return true;
    } catch (error) {
        console.log('❌ خطأ كبير في إرسال الرسائل:', error);
        return false;
    }
}

// وبعد كده باقي الكود (دالة hasAllowedRole, checkBannedUser, updateMainDropdown, إلخ)
async function saveLocalTranscript(ticketData, filename) {
    try {
        // إنشاء مجلد transcripts لو مش موجود
        const transcriptsDir = path.join(__dirname, 'transcripts');
        if (!fs.existsSync(transcriptsDir)) {
            fs.mkdirSync(transcriptsDir, { recursive: true });
            console.log(`📁 تم إنشاء مجلد transcripts محلياً`);
        }
        
        // حفظ الملف محلياً
        const filePath = path.join(transcriptsDir, `${filename}.json`);
        fs.writeFileSync(filePath, JSON.stringify(ticketData, null, 2));
        
        console.log(`✅ تم حفظ نسخة محلية: ${filePath}`);
        return filePath;
    } catch (error) {
        console.log(`❌ خطأ في حفظ النسخة المحلية:`, error.message);
        return null;
    }
}   
// ⭐ دالة لجلب الاسم المعروض في السيرفر
function getDisplayName(member) {
    if (!member) return 'غير معروف';
    return member.displayName || member.user.username || 'مستخدم';
}

// ⭐ دالة لجلب اسم المستخدم من ID
async function getMemberName(guild, userId) {
    try {
        const member = await guild.members.fetch(userId);
        return member.displayName || member.user.username;
    } catch {
        return 'غير معروف';
    }
}
// ⭐ دالة لجلب أسماء الرتب والمستخدمين
async function getNamesFromIds(guild, text) {
    if (!text) return text;
    
    // تحويل منشن المستخدمين <@123456789> إلى أسماء
    text = text.replace(/<@!?(\d+)>/g, async (match, id) => {
        try {
            const user = await client.users.fetch(id);
            return `@${user.username}`;
        } catch {
            return match;
        }
    });
    
    // تحويل منشن الرتب <@&123456789> إلى أسماء
    text = text.replace(/<@&(\d+)>/g, (match, id) => {
        const role = guild.roles.cache.get(id);
        return role ? `@${role.name}` : match;
    });
    
    // تحويل منشن القنوات <#123456789> إلى أسماء
    text = text.replace(/<#(\d+)>/g, (match, id) => {
        const channel = guild.channels.cache.get(id);
        return channel ? `#${channel.name}` : match;
    });
    
    return text;
}
// ⭐ دالة لتقصير الرابط باستخدام TinyURL (أفضل مع الروابط الطويلة)

async function shortenUrl(url) {
    try {
        console.log(`🔗 تقصير الرابط: ${url.substring(0, 50)}...`);
        
        // استخدام TinyURL (بيشتغل مع الروابط الطويلة)
        const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
        
        if (response.ok) {
            const shortUrl = await response.text();
            const trimmedUrl = shortUrl.trim();
            console.log(`✅ تم تقصير الرابط إلى: ${trimmedUrl}`);
            return trimmedUrl;
        }
        
        console.log(`⚠️ فشل تقصير الرابط (الحالة: ${response.status})، استخدام الرابط الأصلي`);
        return url;
    } catch (error) {
        console.log(`⚠️ خطأ في تقصير الرابط: ${error.message}`);
        return url; // لو فشل، نرجع الرابط الأصلي
    }
}
// ⭐ دالة لجمع رسائل التذكرة - نسخة محسنة (مع الحفاظ على تنسيق النص)
async function collectTicketMessages(channelId, ticketId) {
    try {
        console.log(`📥 جاري جمع رسائل التذكرة: ${ticketId}`);
        
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.log('❌ القناة مش موجودة');
            return [];
        }
        
        const guild = channel.guild;
        const messages = [];
        let lastId = null;
        
        // جلب كل الرسائل
        while (true) {
            const fetched = await channel.messages.fetch({ 
                limit: 100, 
                before: lastId 
            }).catch(e => {
                console.log('❌ خطأ في جلب الرسائل:', e);
                return null;
            });
            
            if (!fetched || fetched.size === 0) break;
            
            for (const msg of fetched.values()) {
                // نتأكد إنها مش رسالة البوت system
                if (msg.author.bot && msg.content?.includes('سيتم حذف الروم')) continue;
                
                // ⭐⭐ جلب الاسم المعروض في السيرفر
                let displayName = msg.author.username;
                let member = null;
                
                try {
                    member = await guild.members.fetch(msg.author.id).catch(() => null);
                    if (member) {
                        displayName = member.displayName; // الاسم المعروض في السيرفر
                    }
                } catch {}
                
                // معالجة المحتوى - نحول المنشنات للأسماء
                let content = msg.content || '';
                
                // معالجة منشن المستخدمين في المحتوى
                const userMentions = content.match(/<@!?(\d+)>/g) || [];
                for (const mention of userMentions) {
                    const userId = mention.replace(/<@!?|>/g, '');
                    try {
                        const mentionedMember = await guild.members.fetch(userId).catch(() => null);
                        if (mentionedMember) {
                            const mentionName = mentionedMember.displayName;
                            content = content.replace(mention, `@${mentionName}`);
                        }
                    } catch {}
                }
                
                // معالجة منشن الرتب في المحتوى
                const roleMentions = content.match(/<@&(\d+)>/g) || [];
                for (const mention of roleMentions) {
                    const roleId = mention.replace(/<@&|>/g, '');
                    const role = guild.roles.cache.get(roleId);
                    if (role) {
                        content = content.replace(mention, `@${role.name}`);
                    }
                }
                
                messages.push({
                    id: msg.id,
                    author: displayName,
                    authorId: msg.author.id,
                    authorUsername: msg.author.username,
                    avatar: msg.author.displayAvatarURL(),
                    content: content,
                    rawContent: msg.content || '',
                    timestamp: Math.floor(msg.createdTimestamp / 1000),
                    embeds: msg.embeds.map(e => {
                        // معالجة المنشنات في الامبيدات
                        let embedTitle = e.title || null;
                        let embedDescription = e.description || null;
                        
                        // **التعديل هنا**: لا نقوم بأي معالجة إضافية للـ description
                        // نحتفظ به كما هو بالضبط مع الـ line breaks
                        
                        if (embedTitle) {
                            const titleUserMentions = embedTitle.match(/<@!?(\d+)>/g) || [];
                            for (const mention of titleUserMentions) {
                                const userId = mention.replace(/<@!?|>/g, '');
                                try {
                                    const mentionedMember = guild.members.cache.get(userId);
                                    if (mentionedMember) {
                                        embedTitle = embedTitle.replace(mention, `@${mentionedMember.displayName}`);
                                    }
                                } catch {}
                            }
                            
                            const titleRoleMentions = embedTitle.match(/<@&(\d+)>/g) || [];
                            for (const mention of titleRoleMentions) {
                                const roleId = mention.replace(/<@&|>/g, '');
                                const role = guild.roles.cache.get(roleId);
                                if (role) {
                                    embedTitle = embedTitle.replace(mention, `@${role.name}`);
                                }
                            }
                        }
                        
                        // **تعديل هام**: نحتفظ بالـ description الأصلي دون محاولة تجميعه
                        if (embedDescription) {
                            const descUserMentions = embedDescription.match(/<@!?(\d+)>/g) || [];
                            for (const mention of descUserMentions) {
                                const userId = mention.replace(/<@!?|>/g, '');
                                try {
                                    const mentionedMember = guild.members.cache.get(userId);
                                    if (mentionedMember) {
                                        // نستبدل المنشن ولكن نحتفظ بباقي النص كما هو
                                        embedDescription = embedDescription.replace(mention, `@${mentionedMember.displayName}`);
                                    }
                                } catch {}
                            }
                            
                            const descRoleMentions = embedDescription.match(/<@&(\d+)>/g) || [];
                            for (const mention of descRoleMentions) {
                                const roleId = mention.replace(/<@&|>/g, '');
                                const role = guild.roles.cache.get(roleId);
                                if (role) {
                                    embedDescription = embedDescription.replace(mention, `@${role.name}`);
                                }
                            }
                        }
                        
                        return {
                            title: embedTitle,
                            description: embedDescription, // ✅ نحتفظ بالـ description كما هو بالضبط
                            color: e.hexColor || '#5865F2',
                            fields: e.fields.map(f => {
                                let fieldValue = f.value;
                                
                                const fieldUserMentions = fieldValue.match(/<@!?(\d+)>/g) || [];
                                for (const mention of fieldUserMentions) {
                                    const userId = mention.replace(/<@!?|>/g, '');
                                    try {
                                        const mentionedMember = guild.members.cache.get(userId);
                                        if (mentionedMember) {
                                            fieldValue = fieldValue.replace(mention, `@${mentionedMember.displayName}`);
                                        }
                                    } catch {}
                                }
                                
                                const fieldRoleMentions = fieldValue.match(/<@&(\d+)>/g) || [];
                                for (const mention of fieldRoleMentions) {
                                    const roleId = mention.replace(/<@&|>/g, '');
                                    const role = guild.roles.cache.get(roleId);
                                    if (role) {
                                        fieldValue = fieldValue.replace(mention, `@${role.name}`);
                                    }
                                }
                                
                                return {
                                    name: f.name,
                                    value: fieldValue
                                };
                            }),
                            image: e.image?.url || null,
                            footer: e.footer ? {
                                text: e.footer.text,
                                icon: e.footer.iconURL
                            } : null
                        };
                    }),
                    attachments: msg.attachments.map(a => ({
                        name: a.name,
                        url: a.url
                    }))
                });
            }
            
            lastId = fetched.last()?.id;
            if (fetched.size < 100) break;
        }
        
        // ترتيب الرسائل من الأقدم للأحدث
        messages.reverse();
        console.log(`✅ تم جمع ${messages.length} رسالة للتذكرة ${ticketId}`);
        
        return messages;
    } catch (error) {
        console.log('❌ خطأ في جمع رسائل التذكرة:', error);
        return [];
    }
}
async function uploadToGithub(data, filename) {
    try {
        const token = process.env.GITHUB_TOKEN;
        const repo = 'Youssef4r/discord-html-transcripts55'; // اسم المستخدم/اسم المستودع فقط
        const path = `transcripts/${filename}.json`;
        
        console.log(`📤 جاري رفع الملف: ${filename}.json`);
        
        const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
        
        // التحقق من وجود الملف أولاً (GitHub بيحتاج SHA لو الملف موجود)
        let sha = null;
        const getResponse = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (getResponse.ok) {
            const fileInfo = await getResponse.json();
            sha = fileInfo.sha;
            console.log(`📁 الملف موجود، جاري التحديث...`);
        }
        
        // رفع الملف
        const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
                message: `إضافة نسخة تذكرة ${filename}`,
                content: content,
                sha: sha // لو الملف موجود، بنضيف sha للتحديث
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            // الرابط الخام للملف
            const rawUrl = `https://raw.githubusercontent.com/${repo}/main/${path}`;
            console.log(`✅ تم رفع الملف بنجاح: ${rawUrl}`);
            return rawUrl;
        } else {
            const error = await response.json();
            console.log(`❌ فشل رفع الملف:`, error.message);
            return null;
        }
    } catch (error) {
        console.log('❌ خطأ في رفع الملف:', error.message);
        return null;
    }
}


// ⭐ دالة لإنشاء رابط النسخة - نسخة محسنة
async function createTranscriptUrl(ticket, category, closedBy) {
    try {
        console.log(`📝 بدء إنشاء نسخة للتذكرة: ${ticket.fullId || ticket.id}`);
        
        // جمع رسائل التذكرة
        const messages = await collectTicketMessages(ticket.channelId, ticket.fullId || ticket.id);
        
        // محاولة الوصول للسيرفر
        const guild = client.guilds.cache.get(ticket.guildId);
        
        // ⭐⭐ جمع بيانات المستخدمين والرتب
        const usersMap = {};
        const rolesMap = {};
        const roleColors = {};
        
        if (guild) {
            // جلب كل الرتب في السيرفر مع ألوانها
            guild.roles.cache.forEach(role => {
                if (role.name !== '@everyone') {
                    rolesMap[role.id] = role.name;
                    roleColors[role.id] = role.hexColor;
                }
            });
            
            // جلب أسماء المستخدمين
            for (const msg of messages) {
                if (msg.authorId && !usersMap[msg.authorId]) {
                    try {
                        const member = await guild.members.fetch(msg.authorId).catch(() => null);
                        if (member) {
                            usersMap[msg.authorId] = member.displayName;
                        } else {
                            usersMap[msg.authorId] = msg.author || 'مستخدم';
                        }
                    } catch {
                        usersMap[msg.authorId] = msg.author || 'مستخدم';
                    }
                }
            }
        }
        
        // إضافة المستخدمين الأساسيين
        if (ticket.userId && !usersMap[ticket.userId]) {
            try {
                if (guild) {
                    const member = await guild.members.fetch(ticket.userId).catch(() => null);
                    if (member) {
                        usersMap[ticket.userId] = member.displayName;
                    } else {
                        usersMap[ticket.userId] = ticket.userName || 'مستخدم';
                    }
                } else {
                    usersMap[ticket.userId] = ticket.userName || 'مستخدم';
                }
            } catch {
                usersMap[ticket.userId] = ticket.userName || 'مستخدم';
            }
        }
        
        if (ticket.claimedBy && !usersMap[ticket.claimedBy]) {
            try {
                if (guild) {
                    const member = await guild.members.fetch(ticket.claimedBy).catch(() => null);
                    if (member) {
                        usersMap[ticket.claimedBy] = member.displayName;
                    } else {
                        usersMap[ticket.claimedBy] = ticket.claimedByName || 'مسؤول';
                    }
                } else {
                    usersMap[ticket.claimedBy] = ticket.claimedByName || 'مسؤول';
                }
            } catch {
                usersMap[ticket.claimedBy] = ticket.claimedByName || 'مسؤول';
            }
        }
        
        const closerId = closedBy || ticket.closedBy;
        if (closerId && !usersMap[closerId]) {
            try {
                if (guild) {
                    const member = await guild.members.fetch(closerId).catch(() => null);
                    if (member) {
                        usersMap[closerId] = member.displayName;
                    } else {
                        usersMap[closerId] = ticket.closedByName || 'مسؤول';
                    }
                } else {
                    usersMap[closerId] = ticket.closedByName || 'مسؤول';
                }
            } catch {
                usersMap[closerId] = ticket.closedByName || 'مسؤول';
            }
        }
        
        // إضافة رتبة القسم
        if (category && category.roleId && !rolesMap[category.roleId] && guild) {
            const role = guild.roles.cache.get(category.roleId);
            if (role) {
                rolesMap[category.roleId] = role.name;
                roleColors[category.roleId] = role.hexColor;
            }
        }
        
        // تجهيز بيانات التذكرة
        const ticketData = {
            id: ticket.id,
            fullId: ticket.fullId || ticket.id,
            userId: ticket.userId,
            userName: usersMap[ticket.userId] || ticket.userName || 'مستخدم',
            userTag: ticket.userTag || ticket.userName,
            userAvatar: ticket.userAvatar || 'https://cdn.discordapp.com/embed/avatars/0.png',
            category: ticket.category,
            categoryKey: ticket.categoryKey,
            guildId: ticket.guildId,
            openedAt: Math.floor(ticket.openedAt / 1000),
            closedAt: ticket.closedAt ? Math.floor(ticket.closedAt / 1000) : Math.floor(Date.now() / 1000),
            claimedBy: ticket.claimedBy,
            claimedByName: usersMap[ticket.claimedBy] || ticket.claimedByName || 'لم يتم الاستلام',
            claimedAt: ticket.claimedAt ? Math.floor(ticket.claimedAt / 1000) : null,
            closedBy: closerId,
            closedByName: usersMap[closerId] || ticket.closedByName || 'غير معروف',
            closeReason: ticket.closeReason || 'غير محدد',
            answers: ticket.answers || {},
            questions: category?.questions || {
                required1: 'السؤال الأول',
                required2: 'السؤال الثاني',
                optional1: null,
                optional2: null,
                optional3: null
            },
            userMentions: ticket.userMentions || 0,
            adminMentions: ticket.adminMentions || 0,
            messageCount: messages.length,
            addedAdmins: ticket.addedAdmins || [],
            messages: messages,
            duration: ticket.closedAt ? Math.floor((ticket.closedAt - ticket.openedAt) / 1000) : 0,
            botId: client.user.id,
            users: usersMap,
            roles: rolesMap,
            roleColors: roleColors,
            categoryRoleId: category?.roleId
        };

        console.log(`✅ تم تجهيز بيانات التذكرة: ${ticketData.fullId}`);
        console.log(`📊 عدد المستخدمين: ${Object.keys(usersMap).length}`);
        console.log(`📊 عدد الرتب: ${Object.keys(rolesMap).length}`);
        
        // اسم الملف
        const filename = `${ticket.fullId || ticket.id}-${Date.now()}`;
        
        // ⭐ حفظ نسخة محلية
        await saveLocalTranscript(ticketData, filename);
        
        // رفع الملف على GitHub
        const fileUrl = await uploadToGithub(ticketData, filename);
        
        if (fileUrl) {
            console.log(`✅ تم رفع الملف: ${fileUrl}`);
            
            const baseUrl = 'https://Youssef4r.github.io/discord-html-transcripts55/';
            const previewUrl = `${baseUrl}?url=${encodeURIComponent(fileUrl)}`;
            const downloadUrl = `${baseUrl}?url=${encodeURIComponent(fileUrl)}&download=true`;
            
            return {
                preview: previewUrl,
                download: downloadUrl,
                data: ticketData,
                localPath: `./transcripts/${filename}.json`
            };
        }
        
        // لو فشل الرفع، نرجع للطريقة القديمة
        const jsonData = JSON.stringify(ticketData);
        const encodedData = encodeURIComponent(jsonData);
        const baseUrl = 'https://Youssef4r.github.io/discord-html-transcripts55/';
        const previewUrl = `${baseUrl}?data=${encodedData}`;
        const downloadUrl = `${baseUrl}?data=${encodedData}&download=true`;
        
        return {
            preview: previewUrl,
            download: downloadUrl,
            data: ticketData,
            localPath: `./transcripts/${filename}.json`
        };
    } catch (error) {
        console.log('❌ خطأ في إنشاء رابط النسخة:', error);
        return null;
    }
}
// ⭐ دالة للتحقق من الرتب المسموح لها
function hasAllowedRole(member) {
    if (!member) return false;
    if (!botSettings.allowedRoles || botSettings.allowedRoles.length === 0) return true; // إذا مفيش رتب محددة، الكل مسموح له
    return member.roles.cache.some(role => botSettings.allowedRoles.includes(role.id));
}


// ⭐ دالة للتحقق من المحظورين
async function checkBannedUser(userId, interaction) {
    const banData = bannedUsers.get(userId);
    if (!banData) return false;
    
    // التحقق إذا انتهت مدة الحظر
    if (banData.duration > 0 && Date.now() > banData.bannedAt + banData.duration) {
        bannedUsers.delete(userId);
        await dataManager.saveData('banned_users', Object.fromEntries(bannedUsers));
        return false;
    }
    
    return banData;
}

// ⭐ دالة لتحديث الدروب داون الرئيسي
async function updateMainDropdown(interactionOrChannel) {
    try {
        const selectMenuOptions = [];
        
        if (ticketCategories.size > 0) {
            ticketCategories.forEach((cat, key) => {
                selectMenuOptions.push({
                    label: cat.name,
                    description: cat.description.substring(0, 50),
                    value: `create_${key}`,
                    emoji: cat.emoji || '🎫'
                });
            });
        } else {
            selectMenuOptions.push({
                label: 'لا توجد أقسام',
                description: 'استخدم أمر /إنشاء-قسم لعمل أقسام',
                value: 'no_categories',
                emoji: '⚠️',
                disabled: true
            });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('create_ticket_select')
            .setPlaceholder('🎫 اختر قسم التذكرة...')
            .addOptions(selectMenuOptions);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // إعادة تحميل الإمبايد من الإعدادات
        const embed = new EmbedBuilder()
            .setColor(botSettings.color || '#5865F2')
            .setTitle(botSettings.title)
            .setDescription(botSettings.mainText)
            .setTimestamp();

        if (botSettings.banner) {
            embed.setImage(botSettings.banner);
        }

        let messageToEdit;
        
        if (interactionOrChannel && interactionOrChannel.message && interactionOrChannel.message.editable) {
            messageToEdit = interactionOrChannel.message;
        } else if (mainDropdownMessage && mainDropdownMessage.editable) {
            messageToEdit = mainDropdownMessage;
        } else if (interactionOrChannel && interactionOrChannel.channel) {
            // البحث عن رسالة الدروب داون في القناة
            const messages = await interactionOrChannel.channel.messages.fetch({ limit: 20 });
            const dropdownMsg = messages.find(msg => 
                msg.components.length > 0 && 
                msg.components[0].components[0]?.customId === 'create_ticket_select'
            );
            if (dropdownMsg) {
                messageToEdit = dropdownMsg;
                mainDropdownMessage = dropdownMsg;
            }
        }

        if (messageToEdit) {
            await messageToEdit.edit({ 
                content: '**⬇️ اختر قسم التذكرة من القائمة أدناه:**',
                embeds: [embed], 
                components: [row] 
            });
            console.log('✅ تم تحديث الدروب داون الرئيسي');
        }
    } catch (e) {
        console.log('⚠️ مشكلة في تحديث الدروب داون:', e);
    }
}

// ⭐ دالة لإعادة تعيين الدروب داون بعد الترستر
async function resetDropdownAfterCooldown(userId, interaction) {
    try {
        // الانتظار حتى نهاية مدة الترستر
        setTimeout(async () => {
            // حذف الترستر
            dropdownCooldowns.delete(userId);
            console.log(`✅ انتهى الترستر للمستخدم: ${userId}`);
            
            // تحديث الدروب داون
            await updateMainDropdown(interaction);
        }, 5000);
    } catch (e) {
        console.log('⚠️ خطأ في إعادة تعيين الدروب داون:', e);
    }
}

// ⭐ دالة لتطبيق الترستر على المستخدم
function applyDropdownCooldown(userId, interaction) {
    // تطبيق الترستر لمدة 5 ثواني
    dropdownCooldowns.set(userId, Date.now() + 5000);
    
    // تحديث الدروب داون فوراً ليعرض أنه في وضع الانتظار
    updateDropdownWithCooldownMessage(interaction, userId);
    
    // جدولة إعادة التعيين بعد 5 ثواني
    resetDropdownAfterCooldown(userId, interaction);
}

// ⭐ دالة لتحديث الدروب داون أثناء الترستر
async function updateDropdownWithCooldownMessage(interaction, userId) {
    try {
        const selectMenuOptions = [];
        
        // خلال فترة الترستر، نعرض خيار واحد فقط (معطل)
        selectMenuOptions.push({
            label: '⏳ جاري التحميل...',
            description: 'يرجى الانتظار 5 ثواني لفتح تذكرة جديدة',
            value: 'cooldown_active',
            emoji: '⏳',
            disabled: true
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('create_ticket_select')
            .setPlaceholder('🎫 اختر قسم التذكرة...')
            .addOptions(selectMenuOptions);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // إعادة تحميل الإمبايد
        const embed = new EmbedBuilder()
            .setColor(botSettings.color || '#5865F2')
            .setTitle(botSettings.title)
            .setDescription(botSettings.mainText)
            .setTimestamp();

        if (botSettings.banner) {
            embed.setImage(botSettings.banner);
        }

        if (interaction.message && interaction.message.editable) {
            await interaction.message.edit({ 
                content: '**⏳ يرجى الانتظار 5 ثواني لفتح تذكرة جديدة...**',
                embeds: [embed], 
                components: [row] 
            });
            console.log(`✅ تم تحديث الدروب داون للترستر: ${userId}`);
        }
    } catch (e) {
        console.log('⚠️ مشكلة في تحديث رسالة الترستر:', e);
    }
}

// ⭐ دالة للتحقق من الترستر
function checkCooldown(userId) {
    const cooldownTime = dropdownCooldowns.get(userId);
    if (cooldownTime && cooldownTime > Date.now()) {
        const remainingSeconds = Math.ceil((cooldownTime - Date.now()) / 1000);
        return {
            inCooldown: true,
            remainingSeconds: remainingSeconds
        };
    }
    return { inCooldown: false, remainingSeconds: 0 };
}

// ⭐ دالة لتحميل البيانات عند تشغيل البوت
async function loadInitialData() {
    try {
        console.log('📂 جاري تحميل البيانات...');
        
        const data = await dataManager.loadAllData();
        
        // تحميل الأقسام
        for (const [key, value] of Object.entries(data.categories || {})) {
            ticketCategories.set(key, value);
        }
        console.log(`✅ تم تحميل ${ticketCategories.size} قسم`);
        
        // تحميل التذاكر النشطة
        for (const [key, value] of Object.entries(data.activeTickets || {})) {
            activeTickets.set(key, value);
        }
        console.log(`✅ تم تحميل ${activeTickets.size} تذكرة نشطة`);
        
        // تحميل التذاكر المغلقة
        for (const [key, value] of Object.entries(data.closedTickets || {})) {
            closedTickets.set(key, value);
        }
        console.log(`✅ تم تحميل ${closedTickets.size} تذكرة مغلقة`);
        
        // تحميل العدادات
        for (const [key, value] of Object.entries(data.counters || {})) {
            ticketCounters.set(key, value);
        }
        console.log(`✅ تم تحميل ${ticketCounters.size} عداد`);
        
        // تحميل المحظورين
        for (const [key, value] of Object.entries(data.bannedUsers || {})) {
            bannedUsers.set(key, value);
        }
        console.log(`✅ تم تحميل ${bannedUsers.size} محظور`);
        
        // تحميل إعدادات البوت
        if (data.settings) {
            botSettings = { ...botSettings, ...data.settings };
        }
        console.log('✅ تم تحميل إعدادات البوت');
        
        console.log(`✅ تم تحميل البيانات: ${ticketCategories.size} قسم, ${activeTickets.size} تذكرة نشطة, ${closedTickets.size} تذكرة مغلقة, ${bannedUsers.size} محظور`);
        
        return true;
    } catch (error) {
        console.error('❌ خطأ في تحميل البيانات:', error);
        return false;
    }
}

// ⭐ دالة لحفظ البيانات بشكل دوري
function setupAutoSave() {
    // حفظ البيانات كل 30 ثانية
    dataManager.startAutoSave(ticketCategories, activeTickets, closedTickets, ticketCounters, bannedUsers, botSettings, 30000);
    
    // حفظ البيانات عند إغلاق البوت
    process.on('SIGINT', async () => {
        console.log('🔄 جاري حفظ البيانات قبل الإغلاق...');
        await dataManager.saveAllData(ticketCategories, activeTickets, closedTickets, ticketCounters, bannedUsers, botSettings);
        console.log('✅ تم حفظ البيانات، جاري إغلاق البوت...');
        process.exit(0);
    });
}

client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} شغال!`);
    console.log(`🏛️ نظام تذاكر عائلة العمدة`);
    
    // ⭐ تحديث حالة البوت (ستريم مع الأدعية)
    updateBotStatus(client);
    
    // ⭐ باقي الكود بتاعك
    await loadInitialData();
    await registerCommands();
    
    console.log(`⭐ قناة التقييمات: ${botSettings.ratingChannel || 'غير محددة'}`);
    console.log(`📝 قناة اللوجات: ${botSettings.logChannel || 'غير محددة'}`);
    console.log(`👥 عدد الرتب المسموح لها: ${botSettings.allowedRoles?.length || 0}`);
    
    setupAutoSave();
});
// ⭐ قائمة الأدعية والأذكار (200+)
const ramadanPrayers = [
    // أدعية عامة (1-50)
    "🤲 اللهم بلغنا رمضان",
    "🤲 اللهم اجعلنا من عتقاء رمضان",
    "🤲 ربنا اغفر لنا ذنوبنا",
    "🤲 اللهم إني أسألك الجنة",
    "🤲 اللهم أجرنا من النار",
    "🤲 سبحان الله وبحمده",
    "🤲 سبحان الله العظيم",
    "🤲 لا إله إلا الله",
    "🤲 الله أكبر",
    "🤲 الحمد لله",
    "🤲 أستغفر الله",
    "🤲 اللهم صل على محمد",
    "🤲 حسبنا الله ونعم الوكيل",
    "🤲 توكلت على الله",
    "🤲 لا حول ولا قوة إلا بالله",
    "🤲 اللهم انصر إخواننا في غزة",
    "🤲 اللهم تقبل صيامنا",
    "🤲 اللهم تقبل قيامنا",
    "🤲 اللهم اجعل القرآن ربيع قلوبنا",
    "🤲 ربنا آتنا في الدنيا حسنة",
    "🤲 ربنا آتنا في الآخرة حسنة",
    "🤲 ربنا وقنا عذاب النار",
    "🤲 اللهم اغفر لي ولوالدي",
    "🤲 اللهم اغفر للمسلمين والمسلمات",
    "🤲 اللهم ارحمنا برحمتك",
    "🤲 اللهم إنا نسألك الهدى والتقى",
    "🤲 اللهم ثبت قلوبنا على دينك",
    "🤲 اللهم فرج هم المهمومين",
    "🤲 اللهم اشف مرضانا ومرضى المسلمين",
    "🤲 اللهم وفق ولاة أمورنا",
    "🤲 اللهم احفظ بلادنا وبلاد المسلمين",
    "🤲 اللهم انصر دينك وكتابك",
    "🤲 اللهم أعز الإسلام والمسلمين",
    "🤲 اللهم أذل الشرك والمشركين",
    "🤲 ربنا لا تؤاخذنا إن نسينا أو أخطأنا",
    "🤲 ربنا لا تحمل علينا إصراً",
    "🤲 ربنا ولا تحملنا ما لا طاقة لنا به",
    "🤲 ربنا واعف عنا واغفر لنا وارحمنا",
    "🤲 اللهم إني ظلمت نفسي فاغفر لي",
    "🤲 اللهم إني أسألك العفو والعافية",
    "🤲 اللهم إني أسألك الرضا بعد القضاء",
    "🤲 اللهم إني أسألك برد العيش بعد الموت",
    "🤲 اللهم إني أسألك لذة النظر إلى وجهك",
    "🤲 اللهم إني أسألك الشوق إلى لقائك",
    "🤲 اللهم إني أعوذ بك من ضراء مضرة",
    "🤲 اللهم إني أعوذ بك من فتنة المحيا والممات",
    "🤲 اللهم إني أعوذ بك من عذاب القبر",
    "🤲 اللهم إني أعوذ بك من فتنة المسيح الدجال",
    "🤲 اللهم إني أعوذ بك من الفقر والقلة",
    
    // أدعية رمضانية (51-100)
    "🌙 اللهم أهله علينا بالأمن والإيمان",
    "🌙 اللهم بلغنا رمضان ونحن في أحسن حال",
    "🌙 رمضان كريم",
    "🌙 كل عام وأنتم بخير",
    "🌙 اللهم تقبل صيامنا وقيامنا",
    "🌙 اللهم اجعلنا من الفائزين في رمضان",
    "🌙 اللهم اجعل لنا نصيباً من رحمة رمضان",
    "🌙 اللهم اجعلنا من المغفور لهم في رمضان",
    "🌙 اللهم اعتق رقابنا من النار",
    "🌙 اللهم اجعل صيامنا صيام الصائمين",
    "🌙 اللهم اجعل قيامنا قيام القائمين",
    "🌙 اللهم نبهنا فيه من غفلة الغافلين",
    "🌙 اللهم اجعلنا من المقبولين في رمضان",
    "🌙 اللهم اجعلنا من المرحومين في رمضان",
    "🌙 اللهم اجعلنا من المعتوقين من النار",
    "🌙 اللهم اجعلنا من السعداء في رمضان",
    "🌙 اللهم بارك لنا في شعبان وبلغنا رمضان",
    "🌙 اللهم سلمنا لرمضان وسلم رمضان لنا",
    "🌙 اللهم اجعلنا من عتقائك من النار",
    "🌙 اللهم اجعل رمضان بداية خير لنا",
    "🌙 اللهم اجعل رمضان نهاية ذنوبنا",
    "🌙 اللهم اجعل رمضان شهر عز للإسلام",
    "🌙 اللهم اجعل رمضان شهر نصر للمسلمين",
    "🌙 اللهم اجعل رمضان شهر فرج للمؤمنين",
    "🌙 اللهم اجعل رمضان شهر خير وبركة",
    "🌙 اللهم اجعل رمضان شهر رحمة ومغفرة",
    "🌙 اللهم اجعل رمضان شهر عتق من النار",
    "🌙 اللهم اجعل رمضان شهر قرآن وقيام",
    "🌙 اللهم اجعل رمضان شهر صدقات وإحسان",
    "🌙 اللهم اجعل رمضان شهر صلة أرحام",
    "🌙 اللهم اجعل رمضان شهر توبة وإنابة",
    "🌙 اللهم اجعل رمضان شهر غفران ورحمة",
    "🌙 اللهم اجعل رمضان شهر خير ويمن وبركة",
    "🌙 اللهم اجعلنا من صوامه وقوامه",
    "🌙 اللهم اجعلنا من عبادك الصالحين",
    "🌙 اللهم اجعلنا من المتقين",
    "🌙 اللهم اجعلنا من المحسنين",
    "🌙 اللهم اجعلنا من الصابرين",
    "🌙 اللهم اجعلنا من الشاكرين",
    "🌙 اللهم اجعلنا من الذاكرين",
    "🌙 اللهم اجعلنا من المستغفرين بالأسحار",
    "🌙 اللهم اجعلنا من الذين يستمعون القول فيتبعون أحسنه",
    "🌙 اللهم اجعلنا من الذين آمنوا وعملوا الصالحات",
    "🌙 اللهم اجعلنا من الذين تواصوا بالحق وتواصوا بالصبر",
    "🌙 اللهم اجعلنا من الذين قال ربهم الله ثم استقاموا",
    "🌙 اللهم اجعلنا من الذين أنعمت عليهم",
    "🌙 اللهم اجعلنا من المغضوب عليهم ولا الضالين",
    "🌙 اللهم اجعلنا من عبادك المخلصين",
    "🌙 اللهم اجعلنا من عبادك المتوكلين",
    
    // أذكار الصباح والمساء (101-150)
    "🌅 أصبحنا وأصبح الملك لله",
    "🌅 اللهم بك أصبحنا وبك أمسينا",
    "🌅 اللهم أنت ربي لا إله إلا أنت",
    "🌅 اللهم إني أصبحت أشهدك",
    "🌅 رضيت بالله رباً وبالإسلام ديناً",
    "🌅 حسبي الله لا إله إلا هو",
    "🌅 اللهم إني أسألك العافية في الدنيا والآخرة",
    "🌅 اللهم إني أسألك العفو والعافية",
    "🌅 اللهم استر عوراتي وآمن روعاتي",
    "🌅 اللهم احفظني من بين يدي",
    "🌅 اللهم احفظني من خلفي",
    "🌅 اللهم احفظني عن يميني",
    "🌅 اللهم احفظني عن شمالي",
    "🌅 اللهم احفظني من فوقي",
    "🌅 اللهم احفظني من تحتي",
    "🌅 أعوذ بك اللهم من الزوال",
    "🌅 أعوذ بك اللهم من التحول",
    "🌅 أعوذ بك اللهم من الفتن",
    "🌅 اللهم إني أعوذ بك من الهم والحزن",
    "🌅 اللهم إني أعوذ بك من العجز والكسل",
    "🌅 اللهم إني أعوذ بك من الجبن والبخل",
    "🌅 اللهم إني أعوذ بك من غلبة الدين",
    "🌅 اللهم إني أعوذ بك من غلبة الرجال",
    "🌅 اللهم إني أعوذ بك من غلبة الشيطان",
    "🌅 اللهم إني أعوذ بك من شر ما عملت",
    "🌅 اللهم إني أعوذ بك من شر ما لم أعمل",
    "🌅 اللهم إني أعوذ بك من جهد البلاء",
    "🌅 اللهم إني أعوذ بك من درك الشقاء",
    "🌅 اللهم إني أعوذ بك من سوء القضاء",
    "🌅 اللهم إني أعوذ بك من شماتة الأعداء",
    "🌅 اللهم إني أعوذ بك من موت الغفلة",
    "🌅 اللهم إني أعوذ بك من موت الفجأة",
    "🌅 اللهم إني أعوذ بك من عذاب القبر",
    "🌅 اللهم إني أعوذ بك من فتنة القبر",
    "🌅 اللهم إني أعوذ بك من فتنة النار",
    "🌅 اللهم إني أعوذ بك من فتنة الغنى",
    "🌅 اللهم إني أعوذ بك من فتنة الفقر",
    "🌅 اللهم إني أعوذ بك من فتنة المسيح الدجال",
    "🌅 اللهم إني أعوذ بك من فتنة المحيا والممات",
    "🌅 اللهم إني أعوذ بك من الكسل والهرم",
    "🌅 اللهم إني أعوذ بك من المأثم والمغرم",
    "🌅 اللهم إني أعوذ بك من غلبة الدين",
    "🌅 اللهم إني أعوذ بك من الجبن",
    "🌅 اللهم إني أعوذ بك من البخل",
    "🌅 اللهم إني أعوذ بك من الردى",
    "🌅 اللهم إني أعوذ بك من عذاب النار",
    "🌅 لا إله إلا أنت سبحانك إني كنت من الظالمين",
    "🌅 سبحان الله وبحمده عدد خلقه",
    "🌅 سبحان الله وبحمده رضا نفسه",
    "🌅 سبحان الله وبحمده زنة عرشه",
    
    // أدعية متنوعة (151-200)
    "✨ رب اغفر لي وتب علي إنك أنت التواب الرحيم",
    "✨ رب إني لما أنزلت إلي من خير فقير",
    "✨ رب أوزعني أن أشكر نعمتك",
    "✨ رب هب لي من لدنك رحمة",
    "✨ رب اجعلني مقيم الصلاة",
    "✨ رب اجعل هذا البلد آمناً",
    "✨ ربنا هب لنا من أزواجنا وذرياتنا قرة أعين",
    "✨ ربنا اجعلنا للمتقين إماماً",
    "✨ ربنا آتنا من لدنك رحمة",
    "✨ ربنا أفرغ علينا صبراً",
    "✨ ربنا لا تزغ قلوبنا بعد إذ هديتنا",
    "✨ ربنا هب لنا من لدنك رحمة وهيئ لنا من أمرنا رشداً",
    "✨ ربنا إنا سمعنا منادياً ينادي للإيمان",
    "✨ ربنا فاغفر لنا ذنوبنا",
    "✨ ربنا وكفر عنا سيئاتنا",
    "✨ ربنا وتوفنا مع الأبرار",
    "✨ ربنا وآتنا ما وعدتنا على رسلك",
    "✨ ربنا ولا تخزنا يوم القيامة",
    "✨ ربنا إنك لا تخلف الميعاد",
    "✨ ربنا إنا آمنا فاغفر لنا ذنوبنا",
    "✨ ربنا وقنا عذاب النار",
    "✨ ربنا إنك من تدخل النار فقد أخزيته",
    "✨ ربنا إننا سمعنا منادياً",
    "✨ ربنا فاغفر لنا ذنوبنا وكفر عنا سيئاتنا",
    "✨ ربنا وتوفنا مع الأبرار",
    "✨ ربنا وآتنا ما وعدتنا على رسلك",
    "✨ ربنا ولا تخزنا يوم القيامة",
    "✨ ربنا إنك لا تخلف الميعاد",
    "✨ ربنا اغفر لنا ذنوبنا وإسرافنا في أمرنا",
    "✨ ربنا وثبت أقدامنا",
    "✨ ربنا وانصرنا على القوم الكافرين",
    "✨ ربنا اكشف عنا العذاب",
    "✨ ربنا آمنا بما أنزلت واتبعنا الرسول",
    "✨ ربنا فاكتبنا مع الشاهدين",
    "✨ ربنا اغفر لنا ولإخواننا الذين سبقونا بالإيمان",
    "✨ ربنا ولا تجعل في قلوبنا غلاً للذين آمنوا",
    "✨ ربنا إنك رؤوف رحيم",
    "✨ ربنا عليك توكلنا وإليك أنبنا وإليك المصير",
    "✨ ربنا لا تجعلنا فتنة للذين كفروا",
    "✨ ربنا اغفر لنا إنك أنت العزيز الحكيم",
    "✨ ربنا أتمم لنا نورنا",
    "✨ ربنا واغفر لنا إنك على كل شيء قدير",
    "✨ ربنا افتح بيننا وبين قومنا بالحق",
    "✨ ربنا أرنا الحق حقاً وارزقنا اتباعه",
    "✨ ربنا أرنا الباطل باطلاً وارزقنا اجتنابه",
    "✨ ربنا لا تؤاخذنا بما فعل السفهاء منا",
    "✨ ربنا وأدخلنا في رحمتك",
    "✨ ربنا وأنت خير الراحمين",
    "✨ ربنا وأفرغ علينا صبراً وتوفنا مسلمين"
];

// ⭐ دالة لتحديث حالة البوت كل دقيقة
function updateBotStatus(client) {
    let index = 0;
    
    // تحديث كل دقيقة
    setInterval(() => {
        const currentPrayer = ramadanPrayers[index];
        
        client.user.setPresence({
            activities: [{
                name: currentPrayer,
                type: 1, // 1 = Streaming (حالة ستريم)
                url: 'https://www.twitch.tv/ramadan_prayers' // رابط وهمي (بيظهر كـ Streaming)
            }],
            status: 'online',
        });
        
        console.log(`✅ تم تحديث الحالة: ${currentPrayer}`);
        
        // التالي في القائمة
        index = (index + 1) % ramadanPrayers.length;
    }, 60000); // كل 60 ثانية
}
async function clearOldCommands() {
    try {
        const commands = await client.application.commands.fetch();
        console.log(`📝 عدد الأوامر القديمة: ${commands.size}`);
        
        if (commands.size > 0) {
            for (const command of commands.values()) {
                await client.application.commands.delete(command.id);
                console.log(`🗑️ تم مسح الأمر: ${command.name}`);
            }
            console.log('✅ تم مسح جميع الأوامر القديمة!');
        } else {
            console.log('📭 مفيش أوامر قديمة علشان امسحها');
        }
    } catch (error) {
        console.error('❌ مشكلة في مسح الأوامر القديمة:', error);
    }
}

async function registerCommands() {
    const commands = [
        {
            name: 'إنشاء-قسم',
            description: 'إنشاء قسم تذاكر جديد',
            options: [
                { name: 'اسم', description: 'اسم القسم', type: 3, required: true },
                { name: 'رتبة', description: 'الرتبة المسموح لها', type: 8, required: true },
                { name: 'وصف', description: 'وصف القسم', type: 3, required: true },
                { name: 'كاتجوري', description: 'الكاتجوري اللي هتفتح فيه التذاكر', type: 7, channel_types: [4], required: true },
                { name: 'قناة-اللوجات', description: 'قناة اللوجات', type: 7, channel_types: [0], required: true },
                { name: 'سؤال-اجباري-1', description: 'السؤال الإجباري الأول', type: 3, required: true },
                { name: 'سؤال-اجباري-2', description: 'السؤال الإجباري الثاني', type: 3, required: true },
                { name: 'لون', description: 'لون الإمبايد (أحمر/أخضر/أزرق/أصفر)', type: 3, required: false },
                { name: 'ايموجي', description: 'ايموجي القسم', type: 3, required: false },
                { name: 'سؤال-اختياري-1', description: 'السؤال الاختياري الأول', type: 3, required: false },
                { name: 'سؤال-اختياري-2', description: 'السؤال الاختياري الثاني', type: 3, required: false },
                { name: 'سؤال-اختياري-3', description: 'السؤال الاختياري الثالث', type: 3, required: false },
                { name: 'صورة-القسم', description: 'رابط صورة القسم', type: 3, required: false }
            ]
        },
        {
            name: 'تعديل-قسم',
            description: 'تعديل قسم موجود',
            options: [
                { name: 'اسم-القسم', description: 'اسم القسم المراد تعديله', type: 3, required: true, autocomplete: true },
                { name: 'اسم-جديد', description: 'الاسم الجديد للقسم', type: 3, required: false },
                { name: 'رتبة', description: 'الرتبة الجديدة', type: 8, required: false },
                { name: 'وصف', description: 'الوصف الجديد', type: 3, required: false },
                { name: 'كاتجوري', description: 'الكاتجوري الجديد', type: 7, channel_types: [4], required: false },
                { name: 'قناة-اللوجات', description: 'قناة اللوجات الجديدة', type: 7, channel_types: [0], required: false },
                { name: 'سؤال-اجباري-1', description: 'السؤال الإجباري الأول الجديد', type: 3, required: false },
                { name: 'سؤال-اجباري-2', description: 'السؤال الإجباري الثاني الجديد', type: 3, required: false },
                { name: 'لون', description: 'اللون الجديد', type: 3, required: false },
                { name: 'ايموجي', description: 'الايموجي الجديد', type: 3, required: false },
                { name: 'سؤال-اختياري-1', description: 'السؤال الاختياري الأول الجديد', type: 3, required: false },
                { name: 'سؤال-اختياري-2', description: 'السؤال الاختياري الثاني الجديد', type: 3, required: false },
                { name: 'سؤال-اختياري-3', description: 'السؤال الاختياري الثالث الجديد', type: 3, required: false },
                { name: 'صورة-القسم', description: 'صورة القسم الجديدة', type: 3, required: false }
            ]
        },
        {
            name: 'حذف-قسم',
            description: 'حذف قسم تذاكر',
            options: [] // ⭐ بدون خيارات، هنستخدم دروب داون
        },
        {
            name: 'الاعدادات-الاساسية',
            description: 'الإعدادات الأساسية للبوت',
            options: [
                { name: 'نص-الرئيسي', description: 'النص الرئيسي للتذاكر (استخدم \\n للسطر الجديد)', type: 3, required: false },
                { name: 'عنوان', description: 'عنوان التذاكر', type: 3, required: false },
                { name: 'لون', description: 'لون الإمبايد الرئيسي', type: 3, required: false },
                { name: 'بانر', description: 'رابط صورة البانر', type: 3, required: false }
            ]
        },
        {
            name: 'صلاحيات-الادارة',
            description: 'إدارة صلاحيات استخدام البوت',
            options: [
                { 
                    name: 'اضافة-رتب', 
                    description: 'إضافة رتب مسموح لها (افصل بين الرتب بمسافة أو استخدم منشن)', 
                    type: 3, // ⭐ نوع نصي عشان نقدر ندخل أكتر من رتبة
                    required: false 
                },
                { 
                    name: 'ازالة-رتب', 
                    description: 'إزالة رتب من المسموح لها (افصل بين الرتب بمسافة أو استخدم منشن)', 
                    type: 3, 
                    required: false 
                },
                { name: 'قناة-التقييم', description: 'تعيين قناة التقييمات', type: 7, channel_types: [0], required: false },
                { name: 'قناة-اللوجات', description: 'تعيين قناة اللوجات العامة', type: 7, channel_types: [0], required: false },
                { name: 'قناة-لوجات-الادارة', description: 'تعيين قناة لوجات الصلاحيات والأقسام', type: 7, channel_types: [0], required: false },
                { name: 'عرض', description: 'عرض الإعدادات الحالية', type: 5, required: false }
            ]
        },
        {
            name: 'ارسال-نظام-التذاكر',
            description: 'إرسال إمبد نظام التذاكر إلى القناة الحالية',
            options: []
        },
        {
            name: 'حظر-من-التذاكر',
            description: 'حظر مستخدم من فتح التذاكر',
            options: [
                { name: 'مستخدم', description: 'المستخدم المراد حظره', type: 6, required: true },
                { name: 'المدة', description: 'مدة الحظر (بالساعات, 0 = دائم)', type: 4, required: false },
                { name: 'سبب', description: 'سبب الحظر', type: 3, required: false }
            ]
        },
        {
            name: 'الغاء-حظر-من-التذاكر',
            description: 'إلغاء حظر مستخدم من فتح التذاكر',
            options: [
                { name: 'مستخدم', description: 'المستخدم المراد إلغاء حظره', type: 6, required: true }
            ]
        },
        {
            name: 'قائمة-المحظورين',
            description: 'عرض قائمة المحظورين من التذاكر',
            options: []
        },
        {
            name: 'حفظ-البيانات',
            description: 'حفظ البيانات يدوياً في الملفات',
            options: []
        }
    ];

    try {
        await client.application.commands.set(commands);
        console.log('✅ الأوامر الجديدة اتحملت بنجاح!');
        console.log('📋 الأوامر المتاحة:');
        commands.forEach(cmd => {
            console.log(`   - /${cmd.name}: ${cmd.description}`);
        });
    } catch (error) {
        console.error('❌ مشكلة في تسجيل الأوامر:', error);
    }
}

function convertColor(colorInput) {
    if (!colorInput) return '#5865F2';
    if (colorInput.startsWith('#')) return colorInput;
    
    const colorLower = colorInput.toLowerCase();
    if (colorMap[colorInput]) return colorMap[colorInput];
    if (colorMap[colorLower]) return colorMap[colorLower];
    
    return '#5865F2';
}

// ⭐ عداد الرسائل لنقل الامبيد
const messageCounter = new Map();

// ⭐ دالة لنقل الامبيد لتحت بعد 20 رسالة
async function moveEmbedToBottom(channel, ticketId) {
    try {
        const messages = await channel.messages.fetch({ limit: 50 });
        const embedMessage = messages.find(msg => 
            msg.author.id === client.user.id && 
            msg.embeds.length > 0 && 
            msg.embeds[0].title && 
            msg.embeds[0].title.includes(ticketId)
        );
        
        if (embedMessage) {
            const embed = embedMessage.embeds[0];
            const components = embedMessage.components;
            await embedMessage.delete().catch(() => {});
            await channel.send({ embeds: [embed], components: components }).catch(() => {});
            console.log(`✅ تم نقل امبيد التذكرة ${ticketId} لتحت`);
        }
    } catch (error) {
        console.log('⚠️ خطأ في نقل الامبيد:', error);
    }
}

client.on('interactionCreate', async (interaction) => {
    // تجاهل التفاعلات من البوت نفسه
    if (interaction.user.bot) return;
    
    try {
        // التحقق من المحظورين (للتأكد من أن المحظورين لا يمكنهم التفاعل مع البوت)
        if (!interaction.isCommand() && interaction.user.id !== interaction.guild?.ownerId) {
            const banCheck = await checkBannedUser(interaction.user.id, interaction);
            if (banCheck) {
                const banEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🚫 أنت محظور من استخدام التذاكر')
                    .addFields(
                        { name: 'السبب', value: banCheck.reason || 'غير محدد', inline: false },
                        { name: 'تم الحظر بواسطة', value: `<@${banCheck.bannedBy}>`, inline: true },
                        { name: 'تاريخ الحظر', value: `<t:${Math.floor(banCheck.bannedAt / 1000)}:F>`, inline: true },
                        { name: 'مدة الحظر', value: banCheck.duration === 0 ? 'دائم' : `${Math.floor(banCheck.duration / (60*60*1000))} ساعة`, inline: true }
                    )
                    .setTimestamp();
                
                return interaction.reply({ embeds: [banEmbed], ephemeral: true });
            }
        }

        // ==================== الأوامر (Commands) ====================
        
        // أمر إنشاء قسم
        if (interaction.commandName === 'إنشاء-قسم') {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**\n\nيجب أن تكون أحد أعضاء فريق الدعم لاستخدام هذا الأمر.',
                    ephemeral: true
                });
            }

            const categoryName = interaction.options.getString('اسم');
            const role = interaction.options.getRole('رتبة');
            const description = interaction.options.getString('وصف');
            const categoryChannel = interaction.options.getChannel('كاتجوري');
            const logChannel = interaction.options.getChannel('قناة-اللوجات');
            const question1 = interaction.options.getString('سؤال-اجباري-1');
            const question2 = interaction.options.getString('سؤال-اجباري-2');
            const color = convertColor(interaction.options.getString('لون'));
            const emoji = interaction.options.getString('ايموجي') || '🎫';
            const question3 = interaction.options.getString('سؤال-اختياري-1');
            const question4 = interaction.options.getString('سؤال-اختياري-2');
            const question5 = interaction.options.getString('سؤال-اختياري-3');
            const categoryBanner = interaction.options.getString('صورة-القسم');

            ticketCategories.set(categoryName.toLowerCase(), {
                name: categoryName,
                roleId: role.id,
                description: description,
                color: color,
                emoji: emoji,
                logChannelId: logChannel.id,
                categoryId: categoryChannel.id,
                categoryBanner: categoryBanner,
                questions: {
                    required1: question1,
                    required2: question2,
                    optional1: question3 || null,
                    optional2: question4 || null,
                    optional3: question5 || null
                },
                createdAt: Date.now()
            });

            ticketCounters.set(categoryName.toLowerCase(), 0);

            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ قسم جديد اتعمل!')
                .addFields(
                    { name: 'اسم القسم', value: categoryName, inline: true },
                    { name: 'الرتبة', value: `<@&${role.id}>`, inline: true },
                    { name: 'الكاتجوري', value: `<#${categoryChannel.id}>`, inline: true },
                    { name: 'وصف القسم', value: description },
                    { name: 'قناة اللوجات', value: `<#${logChannel.id}>` }
                )
                .setTimestamp();

            if (categoryBanner) {
                successEmbed.setImage(categoryBanner);
            }

            await interaction.reply({ embeds: [successEmbed], ephemeral: true });
            
            // ⭐ إرسال لوج في قناة لوجات الإدارة
            if (botSettings.adminLogChannel) {
                try {
                    const adminLogChannel = await client.channels.fetch(botSettings.adminLogChannel);
                    if (adminLogChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('📂 قسم جديد')
                            .setDescription(`**تم إنشاء قسم جديد:** **${categoryName}**`)
                            .addFields(
                                { name: '👨‍💼 تم بواسطة', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                                { name: '📅 الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                                { name: '🔧 التفاصيل', value: `الرتبة: <@&${role.id}>\nالوصف: ${description}\nالكاتجوري: <#${categoryChannel.id}>`, inline: false }
                            )
                            .setTimestamp();

                        await adminLogChannel.send({ embeds: [logEmbed] });
                    }
                } catch (e) {
                    console.log('⚠️ خطأ في إرسال لوج الإدارة:', e);
                }
            }
            
            // حفظ البيانات بعد التعديل
            await dataManager.saveAllData(ticketCategories, activeTickets, closedTickets, ticketCounters, bannedUsers, botSettings);
            
            // تحديث الدروب داون الرئيسي
            await updateMainDropdown(interaction);
        }

        // أمر تعديل قسم
        else if (interaction.commandName === 'تعديل-قسم') {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**\n\nيجب أن تكون أحد أعضاء فريق الدعم لاستخدام هذا الأمر.',
                    ephemeral: true
                });
            }

            // ⭐ إرسال لوج في قناة لوجات الإدارة
            if (botSettings.adminLogChannel) {
                try {
                    const adminLogChannel = await client.channels.fetch(botSettings.adminLogChannel);
                    if (adminLogChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#FFA500')
                            .setTitle('✏️ تعديل قسم')
                            .setDescription(`**تم تعديل القسم:** **${interaction.options.getString('اسم-القسم')}**`)
                            .addFields(
                                { name: '👨‍💼 تم بواسطة', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                                { name: '📅 الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                            )
                            .setTimestamp();

                        await adminLogChannel.send({ embeds: [logEmbed] });
                    }
                } catch (e) {
                    console.log('⚠️ خطأ في إرسال لوج الإدارة:', e);
                }
            }
            
            const oldName = interaction.options.getString('اسم-القسم').toLowerCase();
            if (!ticketCategories.has(oldName)) {
                return interaction.reply({ content: '❌ القسم غير موجود', ephemeral: true });
            }

            const category = ticketCategories.get(oldName);
            const newData = { ...category };

            // تحديث البيانات إذا تم إدخالها
            if (interaction.options.getString('اسم-جديد')) {
                newData.name = interaction.options.getString('اسم-جديد');
            }
            if (interaction.options.getRole('رتبة')) {
                newData.roleId = interaction.options.getRole('رتبة').id;
            }
            if (interaction.options.getString('وصف')) {
                newData.description = interaction.options.getString('وصف');
            }
            if (interaction.options.getChannel('كاتجوري')) {
                newData.categoryId = interaction.options.getChannel('كاتجوري').id;
            }
            if (interaction.options.getChannel('قناة-اللوجات')) {
                newData.logChannelId = interaction.options.getChannel('قناة-اللوجات').id;
            }
            if (interaction.options.getString('سؤال-اجباري-1')) {
                newData.questions.required1 = interaction.options.getString('سؤال-اجباري-1');
            }
            if (interaction.options.getString('سؤال-اجباري-2')) {
                newData.questions.required2 = interaction.options.getString('سؤال-اجباري-2');
            }
            if (interaction.options.getString('لون')) {
                newData.color = convertColor(interaction.options.getString('لون'));
            }
            if (interaction.options.getString('ايموجي')) {
                newData.emoji = interaction.options.getString('ايموجي');
            }
            if (interaction.options.getString('سؤال-اختياري-1')) {
                newData.questions.optional1 = interaction.options.getString('سؤال-اختياري-1');
            }
            if (interaction.options.getString('سؤال-اختياري-2')) {
                newData.questions.optional2 = interaction.options.getString('سؤال-اختياري-2');
            }
            if (interaction.options.getString('سؤال-اختياري-3')) {
                newData.questions.optional3 = interaction.options.getString('سؤال-اختياري-3');
            }
            if (interaction.options.getString('صورة-القسم')) {
                newData.categoryBanner = interaction.options.getString('صورة-القسم');
            }

            // إذا تم تغيير الاسم، احذف القديم وأضف الجديد
            if (interaction.options.getString('اسم-جديد')) {
                ticketCategories.delete(oldName);
                ticketCategories.set(newData.name.toLowerCase(), newData);
                
                // تحديث العداد
                const counter = ticketCounters.get(oldName) || 0;
                ticketCounters.delete(oldName);
                ticketCounters.set(newData.name.toLowerCase(), counter);
            } else {
                ticketCategories.set(oldName, newData);
            }

            await interaction.reply({ content: '✅ تم تعديل القسم بنجاح', ephemeral: true });
            
            // حفظ البيانات بعد التعديل
            await dataManager.saveAllData(ticketCategories, activeTickets, closedTickets, ticketCounters, bannedUsers, botSettings);
            
            // تحديث الدروب داون الرئيسي
            await updateMainDropdown(interaction);
        }

        // أمر حذف قسم
        else if (interaction.commandName === 'حذف-قسم') {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**\n\nيجب أن تكون أحد أعضاء فريق الدعم لاستخدام هذا الأمر.',
                    ephemeral: true
                });
            }

            if (ticketCategories.size === 0) {
                await interaction.reply({ content: '❌ لا توجد أقسام لحذفها', ephemeral: true });
                setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
                return;
            }

            // إنشاء قائمة الأقسام
            const selectMenuOptions = [];
            ticketCategories.forEach((cat, key) => {
                selectMenuOptions.push({
                    label: cat.name,
                    description: cat.description.substring(0, 50),
                    value: `delete_${key}`,
                    emoji: cat.emoji || '🎫'
                });
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('delete_category_select')
                .setPlaceholder('🗑️ اختر القسم المراد حذفه...')
                .addOptions(selectMenuOptions);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🗑️ حذف قسم')
                .setDescription('**اختر القسم الذي تريد حذفه من القائمة أدناه**\n\n⚠️ **تحذير:** هذا الإجراء لا يمكن التراجع عنه!')
                .setTimestamp();

            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        // أمر الإعدادات الأساسية
        else if (interaction.commandName === 'الاعدادات-الاساسية') {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**\n\nيجب أن تكون أحد أعضاء فريق الدعم لاستخدام هذا الأمر.',
                    ephemeral: true
                });
            }
        
            // الحصول على القوانين من المستخدم
            let mainText = interaction.options.getString('نص-الرئيسي');
            const title = interaction.options.getString('عنوان');
            const color = convertColor(interaction.options.getString('لون'));
            const banner = interaction.options.getString('بانر');
        
            // استبدال \\n بـ \n للسطور الجديدة
            if (mainText) {
                mainText = mainText.replace(/\\n/g, '\n');
                botSettings.mainText = mainText;
            }
            if (title) botSettings.title = title;
            if (color) botSettings.color = color;
            if (banner) botSettings.banner = banner;
        
            // حفظ الإعدادات في الملف
            await dataManager.saveData('bot_settings', botSettings);
        
            // إنشاء الإمبايد مع النص الجديد
            const mainEmbed = new EmbedBuilder()
                .setColor(botSettings.color)
                .setTitle(botSettings.title)
                .setDescription(botSettings.mainText)
                .setTimestamp();
        
            if (botSettings.banner) {
                mainEmbed.setImage(botSettings.banner);
            }
        
            // إنشاء الدروب داون مع الأقسام
            const selectMenuOptions = [];
            if (ticketCategories.size > 0) {
                ticketCategories.forEach((category, key) => {
                    selectMenuOptions.push({
                        label: category.name,
                        description: category.description.substring(0, 50),
                        value: `create_${key}`,
                        emoji: category.emoji || '🎫'
                    });
                });
            } else {
                selectMenuOptions.push({
                    label: 'لا توجد أقسام',
                    description: 'استخدم أمر /إنشاء-قسم لعمل أقسام',
                    value: 'no_categories',
                    emoji: '⚠️',
                    disabled: true
                });
            }
        
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('create_ticket_select')
                .setPlaceholder('🎫 اختر قسم التذكرة...')
                .addOptions(selectMenuOptions);
        
            const row = new ActionRowBuilder().addComponents(selectMenu);
        
            await interaction.reply({ 
                content: '✅ تم تحديث الإعدادات الأساسية',
                ephemeral: true
            });
            
            // تحديث الدروب داون الرئيسي
            await updateMainDropdown(interaction);
        }

        // أمر صلاحيات الإدارة
        else if (interaction.commandName === 'صلاحيات-الادارة') {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**\n\nيجب أن تكون أحد أعضاء فريق الدعم لاستخدام هذا الأمر.',
                    ephemeral: true
                });
            }

            // التأكد من وجود المصفوفة
            if (!botSettings.allowedRoles) {
                botSettings.allowedRoles = [];
            }

            let changes = []; // لتسجيل التغييرات

            // ⭐ معالجة إضافة رتب متعددة
            if (interaction.options.getString('اضافة-رتب')) {
                const rolesText = interaction.options.getString('اضافة-رتب');
                const roleIds = extractRoleIdsFromText(rolesText, interaction.guild);
                
                if (roleIds.length === 0) {
                    changes.push('⚠️ لم يتم العثور على رتب صالحة للإضافة');
                } else {
                    for (const roleId of roleIds) {
                        if (!botSettings.allowedRoles.includes(roleId)) {
                            botSettings.allowedRoles.push(roleId);
                            changes.push(`➕ تم إضافة رتبة: <@&${roleId}>`);
                        } else {
                            changes.push(`⏭️ الرتبة <@&${roleId}> موجودة بالفعل`);
                        }
                    }
                }
            }

            // ⭐ معالجة إزالة رتب متعددة
            if (interaction.options.getString('ازالة-رتب')) {
                const rolesText = interaction.options.getString('ازالة-رتب');
                const roleIds = extractRoleIdsFromText(rolesText, interaction.guild);
                
                if (roleIds.length === 0) {
                    changes.push('⚠️ لم يتم العثور على رتب صالحة للإزالة');
                } else {
                    for (const roleId of roleIds) {
                        if (botSettings.allowedRoles.includes(roleId)) {
                            botSettings.allowedRoles = botSettings.allowedRoles.filter(id => id !== roleId);
                            changes.push(`➖ تم إزالة رتبة: <@&${roleId}>`);
                        } else {
                            changes.push(`⏭️ الرتبة <@&${roleId}> غير موجودة في القائمة`);
                        }
                    }
                }
            }

            // باقي الخيارات (قناة التقييم، قناة اللوجات، الخ)
            if (interaction.options.getChannel('قناة-التقييم')) {
                const oldChannel = botSettings.ratingChannel ? `<#${botSettings.ratingChannel}>` : 'غير محددة';
                botSettings.ratingChannel = interaction.options.getChannel('قناة-التقييم').id;
                changes.push(`⭐ تغيير قناة التقييم من ${oldChannel} إلى <#${botSettings.ratingChannel}>`);
            }

            if (interaction.options.getChannel('قناة-اللوجات')) {
                const oldChannel = botSettings.logChannel ? `<#${botSettings.logChannel}>` : 'غير محددة';
                botSettings.logChannel = interaction.options.getChannel('قناة-اللوجات').id;
                changes.push(`📝 تغيير قناة اللوجات العامة من ${oldChannel} إلى <#${botSettings.logChannel}>`);
            }

            if (interaction.options.getChannel('قناة-لوجات-الادارة')) {
                const oldChannel = botSettings.adminLogChannel ? `<#${botSettings.adminLogChannel}>` : 'غير محددة';
                botSettings.adminLogChannel = interaction.options.getChannel('قناة-لوجات-الادارة').id;
                changes.push(`⚙️ تغيير قناة لوجات الإدارة من ${oldChannel} إلى <#${botSettings.adminLogChannel}>`);
            }

            if (interaction.options.getBoolean('عرض')) {
                const settingsEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('⚙️ إعدادات البوت الحالية')
                    .addFields(
                        { name: '📊 الرتب المسموح لها', value: botSettings.allowedRoles.map(id => `<@&${id}>`).join('\n') || 'لا توجد', inline: false },
                        { name: '⭐ قناة التقييم', value: botSettings.ratingChannel ? `<#${botSettings.ratingChannel}>` : 'غير محددة', inline: true },
                        { name: '📝 قناة اللوجات العامة', value: botSettings.logChannel ? `<#${botSettings.logChannel}>` : 'غير محددة', inline: true },
                        { name: '⚙️ قناة لوجات الإدارة', value: botSettings.adminLogChannel ? `<#${botSettings.adminLogChannel}>` : 'غير محددة', inline: true }
                    )
                    .setTimestamp();

                return interaction.reply({ embeds: [settingsEmbed], ephemeral: true });
            }

            // لو مفيش تغييرات، نبلغ المستخدم
            if (changes.length === 0) {
                return interaction.reply({ 
                    content: '❌ لم تقم بإدخال أي تغييرات. استخدم الخيارات المتاحة لتحديث الإعدادات.', 
                    ephemeral: true 
                });
            }

            // ⭐ إرسال لوج في قناة لوجات الإدارة
            if (botSettings.adminLogChannel) {
                try {
                    const adminLogChannel = await client.channels.fetch(botSettings.adminLogChannel);
                    if (adminLogChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#FFA500')
                            .setTitle('⚙️ تغيير في إعدادات البوت')
                            .setDescription(`**تم إجراء التغييرات التالية:**\n\n${changes.join('\n')}`)
                            .addFields(
                                { name: '👨‍💼 تم بواسطة', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                                { name: '📅 الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                            )
                            .setTimestamp();

                        await adminLogChannel.send({ embeds: [logEmbed] });
                    }
                } catch (e) {
                    console.log('⚠️ خطأ في إرسال لوج الإدارة:', e);
                }
            }

            // عرض ملخص التغييرات للمستخدم
            const summaryEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ تم تحديث الإعدادات')
                .setDescription(changes.join('\n'))
                .setTimestamp();

            await interaction.reply({ embeds: [summaryEmbed], ephemeral: true });
            
            // مسح رسالة الأمر بعد 10 ثواني
            setTimeout(() => {
                interaction.deleteReply().catch(() => {});
            }, 10000);
            
            // حفظ البيانات
            await dataManager.saveAllData(ticketCategories, activeTickets, closedTickets, ticketCounters, bannedUsers, botSettings);
        }

        // أمر إرسال نظام التذاكر
        else if (interaction.commandName === 'ارسال-نظام-التذاكر') {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**\n\nيجب أن تكون أحد أعضاء فريق الدعم لاستخدام هذا الأمر.',
                    ephemeral: true
                });
            }

            // إنشاء الإمبد مع الإعدادات الحالية
            const mainEmbed = new EmbedBuilder()
                .setColor(botSettings.color || '#5865F2')
                .setTitle(botSettings.title || '🎫 نظام تذاكر الدعم الفني')
                .setDescription(botSettings.mainText || '🏆 **نظام تذاكر الدعم الفني**\n\nاختر قسم الدعم المناسب من القائمة أدناه للحصول على المساعدة من فريقنا المختص.\n\n📌 **نظام تذاكر عائلة العمدة**')
                .setTimestamp();

            if (botSettings.banner) {
                mainEmbed.setImage(botSettings.banner);
            }

            // إنشاء قائمة الأقسام
            const selectMenuOptions = [];
            
            if (ticketCategories.size > 0) {
                ticketCategories.forEach((cat, key) => {
                    selectMenuOptions.push({
                        label: cat.name,
                        description: cat.description.substring(0, 50),
                        value: `create_${key}`,
                        emoji: cat.emoji || '🎫'
                    });
                });
            } else {
                selectMenuOptions.push({
                    label: 'لا توجد أقسام',
                    description: 'استخدم أمر /إنشاء-قسم لعمل أقسام',
                    value: 'no_categories',
                    emoji: '⚠️',
                    disabled: true
                });
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('create_ticket_select')
                .setPlaceholder('🎫 اختر قسم التذكرة...')
                .addOptions(selectMenuOptions);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            // إرسال الرسالة في القناة الحالية
            await interaction.channel.send({
                content: '**⬇️ اختر قسم التذكرة من القائمة أدناه:**',
                embeds: [mainEmbed],
                components: [row]
            });

            // حفظ مرجع الرسالة الرئيسية
            const messages = await interaction.channel.messages.fetch({ limit: 1 });
            mainDropdownMessage = messages.first();

            // تأكيد للمستخدم
            await interaction.reply({ 
                content: '✅ تم إرسال نظام التذاكر بنجاح في هذه القناة!', 
                ephemeral: true 
            });
        }

        // أمر حظر من التذاكر
        else if (interaction.commandName === 'حظر-من-التذاكر') {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**\n\nيجب أن تكون أحد أعضاء فريق الدعم لاستخدام هذا الأمر.',
                    ephemeral: true
                });
            }

            const user = interaction.options.getUser('مستخدم');
            const durationHours = interaction.options.getInteger('المدة') || 0; // 0 = دائم
            const reason = interaction.options.getString('سبب') || 'غير محدد';

            bannedUsers.set(user.id, {
                reason: reason,
                bannedBy: interaction.user.id,
                bannedAt: Date.now(),
                duration: durationHours * 60 * 60 * 1000 // تحويل الساعات إلى ملي ثانية
            });

            const banEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🚫 تم حظر المستخدم من التذاكر')
                .addFields(
                    { name: 'المستخدم', value: `${user.tag} (<@${user.id}>)`, inline: false },
                    { name: 'السبب', value: reason, inline: true },
                    { name: 'المدة', value: durationHours === 0 ? 'دائم' : `${durationHours} ساعة`, inline: true },
                    { name: 'تم الحظر بواسطة', value: `<@${interaction.user.id}>`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [banEmbed], ephemeral: true });
            
            // حفظ البيانات
            await dataManager.saveAllData(ticketCategories, activeTickets, closedTickets, ticketCounters, bannedUsers, botSettings);
        }

        // أمر إلغاء حظر من التذاكر
        else if (interaction.commandName === 'الغاء-حظر-من-التذاكر') {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**\n\nيجب أن تكون أحد أعضاء فريق الدعم لاستخدام هذا الأمر.',
                    ephemeral: true
                });
            }

            const user = interaction.options.getUser('مستخدم');
            
            if (!bannedUsers.has(user.id)) {
                return interaction.reply({ content: '❌ هذا المستخدم ليس محظوراً', ephemeral: true });
            }

            bannedUsers.delete(user.id);

            await interaction.reply({ content: `✅ تم إلغاء حظر ${user.tag}`, ephemeral: true });
            
            // حفظ البيانات
            await dataManager.saveAllData(ticketCategories, activeTickets, closedTickets, ticketCounters, bannedUsers, botSettings);
        }

        // أمر قائمة المحظورين
        else if (interaction.commandName === 'قائمة-المحظورين') {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**\n\nيجب أن تكون أحد أعضاء فريق الدعم لاستخدام هذا الأمر.',
                    ephemeral: true
                });
            }

            if (bannedUsers.size === 0) {
                return interaction.reply({ content: '✅ لا يوجد محظورين', ephemeral: true });
            }

            let bannedList = '';
            for (const [userId, data] of bannedUsers) {
                const remaining = data.duration > 0 ? Math.ceil((data.bannedAt + data.duration - Date.now()) / (60 * 60 * 1000)) : 'دائم';
                bannedList += `<@${userId}> - ${data.reason} - باقي: ${remaining} ساعة\n`;
            }

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🚫 قائمة المحظورين من التذاكر')
                .setDescription(bannedList)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // أمر حفظ البيانات يدوياً
        else if (interaction.commandName === 'حفظ-البيانات') {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**\n\nيجب أن تكون أحد أعضاء فريق الدعم لاستخدام هذا الأمر.',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });
            
            try {
                await dataManager.saveAllData(ticketCategories, activeTickets, closedTickets, ticketCounters, bannedUsers, botSettings);
                
                const statsEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ تم حفظ البيانات بنجاح!')
                    .addFields(
                        { name: '📂 عدد الأقسام', value: `${ticketCategories.size} قسم`, inline: true },
                        { name: '🎫 تذاكر نشطة', value: `${activeTickets.size} تذكرة`, inline: true },
                        { name: '🔒 تذاكر مغلقة', value: `${closedTickets.size} تذكرة`, inline: true },
                        { name: '📊 التذاكر المحذوفة', value: `${deletedTickets.size} تذكرة`, inline: true },
                        { name: '🚫 المحظورين', value: `${bannedUsers.size} مستخدم`, inline: true },
                        { name: '🔢 عدد العدادات', value: `${ticketCounters.size} عداد`, inline: true }
                    )
                    .setFooter({ text: 'نظام تذاكر عائلة العمدة - النسخ الاحتياطي' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [statsEmbed] });
            } catch (error) {
                await interaction.editReply({ 
                    content: '❌ حصل خطأ في حفظ البيانات!'
                });
            }
        }

        // ==================== القوائم المنسدلة (Select Menus) ====================
        
        // معالجة اختيار قسم للحذف
        else if (interaction.isStringSelectMenu() && interaction.customId === 'delete_category_select') {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**',
                    ephemeral: true
                });
            }

            const selectedValue = interaction.values[0];
            const categoryKey = selectedValue.replace('delete_', '');
            const category = ticketCategories.get(categoryKey);

            if (!category) {
                return interaction.reply({ content: '❌ القسم غير موجود', ephemeral: true });
            }

            // حفظ اسم القسم قبل الحذف
            const categoryName = category.name;
            const categoryRoleId = category.roleId;

            // حذف القسم
            ticketCategories.delete(categoryKey);
            ticketCounters.delete(categoryKey);

            // رسالة تأكيد
            const confirmEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🗑️ تم حذف القسم')
                .setDescription(`**تم حذف القسم:** **${categoryName}**`)
                .addFields(
                    { name: '👨‍💼 تم بواسطة', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                    { name: '📅 الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

            // ⭐ إرسال لوج في قناة لوجات الإدارة
            if (botSettings.adminLogChannel) {
                try {
                    const adminLogChannel = await client.channels.fetch(botSettings.adminLogChannel);
                    if (adminLogChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('🗑️ حذف قسم')
                            .setDescription(`**تم حذف القسم:** **${categoryName}**`)
                            .addFields(
                                { name: '👨‍💼 تم بواسطة', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                                { name: '📅 الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                                { name: '🔧 تفاصيل القسم المحذوف', value: `الرتبة: <@&${categoryRoleId}>\nالوصف: ${category.description}`, inline: false }
                            )
                            .setTimestamp();

                        await adminLogChannel.send({ embeds: [logEmbed] });
                    }
                } catch (e) {
                    console.log('⚠️ خطأ في إرسال لوج الإدارة:', e);
                }
            }

            // حفظ البيانات
            await dataManager.saveAllData(ticketCategories, activeTickets, closedTickets, ticketCounters, bannedUsers, botSettings);
            
            // تحديث الدروب داون الرئيسي
            await updateMainDropdown(interaction);
            
            // مسح رسالة الأمر بعد 5 ثواني
            setTimeout(() => {
                interaction.deleteReply().catch(() => {});
            }, 5000);
        }

        // فتح التذكرة - مع الترستر
        else if (interaction.isStringSelectMenu() && interaction.customId === 'create_ticket_select') {
            const selectedValue = interaction.values[0];
            
            if (selectedValue === 'no_categories') {
                return interaction.reply({ content: '❌ مفيش أقسام متاحة.', ephemeral: true });
            }

            const userId = interaction.user.id;
            
            // التحقق من الترستر أولاً
            const cooldownCheck = checkCooldown(userId);
            if (cooldownCheck.inCooldown) {
                return interaction.reply({ 
                    content: `⏳ **الرجاء الانتظار ${cooldownCheck.remainingSeconds} ثانية قبل فتح تذكرة جديدة**`,
                    ephemeral: true 
                });
            }

            // التحقق من الحظر
            const banCheck = await checkBannedUser(userId, interaction);
            if (banCheck) {
                const banEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🚫 أنت محظور من فتح التذاكر')
                    .addFields(
                        { name: 'السبب', value: banCheck.reason, inline: false },
                        { name: 'تم الحظر بواسطة', value: `<@${banCheck.bannedBy}>`, inline: true }
                    );
                return interaction.reply({ embeds: [banEmbed], ephemeral: true });
            }

            // تطبيق الترستر فوراً
            applyDropdownCooldown(userId, interaction);

            // التحقق من وجود تذكرة مفتوحة
            let hasOpenTicket = false;
            let existingTicketId = '';
            for (const [ticketId, ticket] of activeTickets) {
                if (ticket.userId === userId) {
                    hasOpenTicket = true;
                    existingTicketId = ticketId;
                    break;
                }
            }
            
            if (hasOpenTicket) {
                const existingTicket = activeTickets.get(existingTicketId);
                return interaction.reply({ 
                    content: `❌ **لديك تذكرة مفتوحة بالفعل!**\n\n🏷️ **رقم التذكرة:** ${existingTicketId}\n🔗 **رابط التذكرة:** <#${existingTicket.channelId}>`,
                    ephemeral: true 
                });
            }

            const categoryKey = selectedValue.replace('create_', '');
            const category = ticketCategories.get(categoryKey);
            
            if (!category) {
                return interaction.reply({ content: '❌ القسم ده مش موجود.', ephemeral: true });
            }

            // فتح المودال
            const counter = (ticketCounters.get(categoryKey) || 0) + 1;
            ticketCounters.set(categoryKey, counter);
            
            const ticketId = `${category.name}`;
            const ticketNumber = counter;

            const modal = new ModalBuilder()
                .setCustomId(`ticket_modal_${categoryKey}_${interaction.user.id}_${counter}`)
                .setTitle(`📝 ${ticketId} - ${ticketNumber}`);

            const question1Input = new TextInputBuilder()
                .setCustomId('question1_input')
                .setLabel(category.questions.required1.substring(0, 45))
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('أدخل الإجابة هنا...')
                .setRequired(true)
                .setMaxLength(1000);

            const question2Input = new TextInputBuilder()
                .setCustomId('question2_input')
                .setLabel(category.questions.required2.substring(0, 45))
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('أدخل الإجابة هنا...')
                .setRequired(true)
                .setMaxLength(1000);

            const actionRows = [];
            
            const firstActionRow = new ActionRowBuilder().addComponents(question1Input);
            const secondActionRow = new ActionRowBuilder().addComponents(question2Input);
            
            actionRows.push(firstActionRow, secondActionRow);

            // إضافة الأسئلة الاختيارية الثلاثة
            const optionalQuestions = [
                { question: category.questions.optional1, id: 'question3_input' },
                { question: category.questions.optional2, id: 'question4_input' },
                { question: category.questions.optional3, id: 'question5_input' }
            ];

            for (const item of optionalQuestions) {
                if (item.question) {
                    const optionalInput = new TextInputBuilder()
                        .setCustomId(item.id)
                        .setLabel(item.question.substring(0, 45))
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('أدخل الإجابة هنا (اختياري)...')
                        .setRequired(false)
                        .setMaxLength(1000);
                    
                    const actionRow = new ActionRowBuilder().addComponents(optionalInput);
                    actionRows.push(actionRow);
                }
            }

            modal.addComponents(...actionRows);
            await interaction.showModal(modal);
        }

        // خيارات الخصائص (Properties Menu)
        else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('properties_menu_')) {
            const parts = interaction.customId.split('_');
            const ticketId = parts[2];
            const userId = parts[3];
            const action = interaction.values[0];
            const ticket = activeTickets.get(ticketId);
            
            if (!ticket) {
                return interaction.reply({ content: '❌ التذكرة مش موجودة.', ephemeral: true });
            }

            // التحقق من الترستر
            if (interaction.user.id !== userId) {
                return interaction.reply({ 
                    content: '❌ **هذه الخصائص ليست لك!**\n\nيمكنك فتح خصائص جديدة من زر الخصائص.',
                    ephemeral: true 
                });
            }

            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**',
                    ephemeral: true
                });
            }

            if (action === 'rename_channel') {
                const modal = new ModalBuilder()
                    .setCustomId(`rename_modal_${ticketId}_${userId}`)
                    .setTitle('✏️ تغيير اسم الروم');

                const nameInput = new TextInputBuilder()
                    .setCustomId('new_name')
                    .setLabel('الاسم الجديد للروم')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('مثال: تذكرة-1234')
                    .setRequired(true)
                    .setMaxLength(50);

                const row = new ActionRowBuilder().addComponents(nameInput);
                modal.addComponents(row);

                await interaction.showModal(modal);
            }
            else if (action === 'add_admin') {
                const modal = new ModalBuilder()
                    .setCustomId(`add_admin_modal_${ticketId}_${userId}`)
                    .setTitle('👨‍💼 إضافة أداري');
            
                const adminIdInput = new TextInputBuilder()
                    .setCustomId('admin_id')
                    .setLabel('أدخل الأيدي الخاص بالأداري')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('123456789012345678')
                    .setRequired(true)
                    .setMaxLength(20);
            
                const row = new ActionRowBuilder().addComponents(adminIdInput);
                modal.addComponents(row);
            
                await interaction.showModal(modal);
            }
            else if (action === 'mention_user') {
                const mentionEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('📢 استدعاء صاحب التذكرة')
                    .setDescription(`<@${ticket.userId}> - تم استدعائك من قبل <@${interaction.user.id}>`)
                    .addFields(
                        { name: '🏷️ رقم التذكرة', value: ticketId, inline: true },
                        { name: '📂 القسم', value: ticket.category, inline: true }
                    )
                    .setTimestamp();

                await interaction.channel.send({ 
                    content: `<@${ticket.userId}>`,
                    embeds: [mentionEmbed] 
                });
                
                await interaction.reply({ content: '✅ تم استدعاء صاحب التذكرة.', ephemeral: true });
                
                ticket.userMentions++;
                activeTickets.set(ticketId, ticket);
                
                // حفظ البيانات بعد التعديل
                await dataManager.saveData('active_tickets', Object.fromEntries(activeTickets));
            }
            else if (action === 'close_ticket') {
                const modal = new ModalBuilder()
                    .setCustomId(`close_modal_${ticketId}_${userId}`)
                    .setTitle('🔒 إغلاق التذكرة');

                const reasonInput = new TextInputBuilder()
                    .setCustomId('close_reason')
                    .setLabel('سبب الإغلاق')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('أدخل سبب إغلاق التذكرة...')
                    .setRequired(true)
                    .setMaxLength(500);

                const row = new ActionRowBuilder().addComponents(reasonInput);
                modal.addComponents(row);

                await interaction.showModal(modal);
            }
        }

        // ==================== الأزرار (Buttons) ====================
        
        // زر استلام التذكرة
        else if (interaction.isButton() && interaction.customId.startsWith('claim_')) {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**\n\nيجب أن تكون أحد أعضاء فريق الدعم لاستخدام هذا الزر.',
                    ephemeral: true
                });
            }

            const ticketId = interaction.customId.replace('claim_', '');
            const ticket = activeTickets.get(ticketId);
            
            if (!ticket) {
                return interaction.reply({ content: '❌ التذكرة مش موجودة.', ephemeral: true });
            }

            if (ticket.status === 'مستلمة') {
                return interaction.reply({ content: '❌ التذكرة دي مستلمة بالفعل.', ephemeral: true });
            }

            ticket.status = 'مستلمة';
            ticket.claimedBy = interaction.user.id;
            ticket.claimedByName = interaction.user.tag;
            ticket.claimedAt = Date.now();
            activeTickets.set(ticketId, ticket);

            // حفظ البيانات بعد استلام التذكرة
            await dataManager.saveData('active_tickets', Object.fromEntries(activeTickets));

            const category = ticketCategories.get(ticket.categoryKey);
            
            // تحديث الامبيد
            const message = interaction.message;
            const oldEmbed = message.embeds[0];
            
            const updatedEmbed = EmbedBuilder.from(oldEmbed)
                .setColor('#00FF00')
                .setDescription(`**تم فتح تذكرة الدعم الفني**\n\n👤 **صاحب التذكرة:** <@${ticket.userId}>\n👨‍💼 **تم الاستلام بواسطة:** <@${interaction.user.id}> (${interaction.user.tag})\n📂 **القسم:** ${ticket.category}\n📅 **تاريخ الفتح:** <t:${Math.floor(ticket.openedAt / 1000)}:F>\n📅 **تاريخ الاستلام:** <t:${Math.floor(Date.now() / 1000)}:R>\n📊 **الحالة:** ✅ مستلمة`);

            const claimButton = new ButtonBuilder()
                .setCustomId(`claim_${ticketId}`)
                .setLabel(`✅ تم الاستلام بواسطة ${interaction.user.tag}`)
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
                .setDisabled(true);

            const propertiesButton = new ButtonBuilder()
                .setCustomId(`properties_${ticketId}`)
                .setLabel('خصائص')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⚙️');

            const row = new ActionRowBuilder().addComponents(claimButton, propertiesButton);

            try {
                await interaction.update({ embeds: [updatedEmbed], components: [row] });
            } catch (error) {
                if (error.code === 10062) {
                    console.log('⚠️ التفاعل انتهت صلاحيته، سيتم تحديث الرسالة مباشرة');
                    try {
                        await message.edit({ embeds: [updatedEmbed], components: [row] });
                        await interaction.reply({ content: '✅ تم استلام التذكرة', ephemeral: true });
                    } catch (fetchError) {
                        console.log('❌ لا يمكن تحديث الرسالة:', fetchError);
                    }
                } else {
                    throw error;
                }
            }

            const displayName = interaction.member.displayName;
            await interaction.channel.send(`✅ **تم استلام التذكرة بواسطة:** <@${interaction.user.id}> (${displayName})`);

            // لوج عام
            if (botSettings.logChannel) {
                try {
                    const generalLogChannel = await client.channels.fetch(botSettings.logChannel);
                    if (generalLogChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('✅ تذكرة مستلمة')
                            .setDescription(`**${ticketId}**\n👨‍💼 ${interaction.user.tag}\n👤 <@${ticket.userId}>`)
                            .setTimestamp();
                        await generalLogChannel.send({ embeds: [logEmbed] });
                    }
                } catch (e) {}
            }

            try {
                const member = await interaction.guild.members.fetch(ticket.userId);
                const displayName = interaction.member.displayName;
                const dmEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ تم استلام تذكرتك')
                    .setDescription(`**تم استلام تذكرتك من قبل المسؤول**\n\n🏷️ **رقم التذكرة:** ${ticketId}\n👨‍💼 **المسؤول:** ${displayName} (${interaction.user.tag})\n📅 **وقت الاستلام:** <t:${Math.floor(Date.now() / 1000)}:R>`)
                    .addFields(
                        { name: '🔗 رابط التذكرة', value: `https://discord.com/channels/${interaction.guild.id}/${ticket.channelId}`, inline: false },
                        { name: '📝 ملاحظة', value: 'سيتم التواصل معك قريباً لحل مشكلتك.', inline: false }
                    )
                    .setFooter({ text: 'نظام تذاكر عائلة العمدة - شكراً لصبرك' })
                    .setTimestamp();

                await member.send({ embeds: [dmEmbed] });
            } catch (dmError) {
                console.log('❌ مفيش خاص للمستخدم');
            }
        }

        // زر خصائص
        else if (interaction.isButton() && interaction.customId.startsWith('properties_')) {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**\n\nيجب أن تكون أحد أعضاء فريق الدعم لاستخدام هذا الزر.',
                    ephemeral: true
                });
            }

            const ticketId = interaction.customId.replace('properties_', '');
            const ticket = activeTickets.get(ticketId);
            
            if (!ticket) {
                return interaction.reply({ content: '❌ التذكرة مش موجودة.', ephemeral: true });
            }

            const propertiesMenu = new StringSelectMenuBuilder()
                .setCustomId(`properties_menu_${ticketId}_${interaction.user.id}`)
                .setPlaceholder('⚙️ اختر من الخصائص...')
                .addOptions([
                    {
                        label: 'تغير اسم الروم',
                        description: 'تغيير اسم روم التذكرة',
                        value: 'rename_channel',
                        emoji: '✏️'
                    },
                    {
                        label: 'إضافة أداري',
                        description: 'إضافة أداري للتذكرة',
                        value: 'add_admin',
                        emoji: '👨‍💼'
                    },
                    {
                        label: 'استدعاء صاحب التذكرة',
                        description: 'منشن لصاحب التذكرة',
                        value: 'mention_user',
                        emoji: '👤'
                    },
                    {
                        label: 'إغلاق التذكرة',
                        description: 'إغلاق التذكرة مع السبب',
                        value: 'close_ticket',
                        emoji: '🔒'
                    }
                ]);

            const row = new ActionRowBuilder().addComponents(propertiesMenu);

            const propertiesEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('⚙️ خصائص التذكرة')
                .setDescription(`**${ticketId}**\nاختر الإجراء المطلوب من القائمة أدناه:`)
                .addFields(
                    { name: '👤 صاحب التذكرة', value: `<@${ticket.userId}>`, inline: true },
                    { name: '📊 الحالة', value: ticket.status, inline: true },
                    { name: '👨‍💼 المسؤول', value: ticket.claimedByName || 'لم يستلم', inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [propertiesEmbed], components: [row], ephemeral: true });
        }

        // زر التقييم
        else if (interaction.isButton() && interaction.customId.startsWith('rate_')) {
            const parts = interaction.customId.split('_');
            const rating = parseInt(parts[1]);
            const ticketId = parts.slice(2).join('_'); // عشان نتعامل مع أسماء التذاكر الطويلة
            
            console.log(`⭐ بدء تقييم للتذكرة: ${ticketId} بتقييم ${rating}`);
            
            let ticket = closedTickets.get(ticketId) || deletedTickets.get(ticketId) || activeTickets.get(ticketId);
            
            if (!ticket) {
                console.log(`❌ التذكرة ${ticketId} مش موجودة`);
                return interaction.reply({ 
                    content: '❌ **لا يمكن العثور على بيانات التذكرة**\nربما تم حذفها من قاعدة البيانات',
                    ephemeral: true 
                });
            }
        
            if (ticket.rated) {
                return interaction.reply({ 
                    content: '❌ **تم تقييم هذه التذكرة مسبقاً**\nشكراً لاستخدامك خدمتنا', 
                    ephemeral: true 
                });
            }
        
            // فتح مودال للتعليق
            const modal = new ModalBuilder()
                .setCustomId(`comment_modal_${ticketId}_${rating}_${interaction.user.id}`)
                .setTitle(`⭐ تقييم التذكرة ${ticketId}`);
        
            const commentInput = new TextInputBuilder()
                .setCustomId('comment')
                .setLabel('💬 تعليقك على الخدمة (اختياري)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('اكتب رأيك في الخدمة المقدمة...')
                .setRequired(false)
                .setMaxLength(1000);
        
            const row = new ActionRowBuilder().addComponents(commentInput);
            modal.addComponents(row);
        
            await interaction.showModal(modal);
        }

        // أزرار التحكم النهائية
        else if (interaction.isButton() && interaction.customId.startsWith('reopen_')) {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**',
                    ephemeral: true
                });
            }

            const ticketId = interaction.customId.replace('reopen_', '');
            const ticket = closedTickets.get(ticketId);
            
            if (ticket) {
                try {
                    const channel = await interaction.guild.channels.fetch(ticket.channelId);
                    await channel.permissionOverwrites.edit(ticket.userId, {
                        SendMessages: true
                    });
                    
                    await interaction.reply({ content: '✅ تم فتح الكتابة في الروم.', ephemeral: true });
                    await channel.send(`📝 **تم فتح الكتابة في الروم بواسطة:** <@${interaction.user.id}>`);
                    
                    console.log(`✅ تم فتح الكتابة للتذكرة ${ticketId}`);
                } catch (error) {
                    console.log(`❌ خطأ في فتح الكتابة:`, error.message);
                    await interaction.reply({ content: '❌ خطأ في فتح الكتابة.', ephemeral: true });
                }
            }
        }
        else if (interaction.isButton() && interaction.customId.startsWith('close_write_')) {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**',
                    ephemeral: true
                });
            }

            const ticketId = interaction.customId.replace('close_write_', '');
            const ticket = closedTickets.get(ticketId);
            
            if (ticket) {
                try {
                    const channel = await interaction.guild.channels.fetch(ticket.channelId);
                    await channel.permissionOverwrites.edit(ticket.userId, {
                        SendMessages: false
                    });
                    
                    await interaction.reply({ content: '✅ تم إغلاق الكتابة في الروم.', ephemeral: true });
                    await channel.send(`🔏 **تم إغلاق الكتابة في الروم بواسطة:** <@${interaction.user.id}>`);
                    
                    console.log(`✅ تم إغلاق الكتابة للتذكرة ${ticketId}`);
                } catch (error) {
                    console.log(`❌ خطأ في إغلاق الكتابة:`, error.message);
                    await interaction.reply({ content: '❌ خطأ في إغلاق الكتابة.', ephemeral: true });
                }
            }
        }
        else if (interaction.isButton() && interaction.customId.startsWith('final_close_')) {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**',
                    ephemeral: true
                });
            }

            const ticketId = interaction.customId.replace('final_close_', '');
            const ticket = closedTickets.get(ticketId);
            
            if (ticket) {
                try {
                    const channel = await interaction.guild.channels.fetch(ticket.channelId);
                    
                    await channel.send('⏳ **سيتم حذف الروم بعد 10 ثواني...**');
                    
                    setTimeout(async () => {
                        try {
                            // إنشاء نسخة HTML قبل الحذف
                            const category = ticketCategories.get(ticket.categoryKey);
                            if (category) {
                                await createTranscriptUrl(ticket, category, ticket.closedBy);
                                console.log(`✅ تم إنشاء نسخة HTML للتذكرة ${ticketId} قبل الحذف`);
                            }
                            
                            await channel.delete();
                            closedTickets.delete(ticketId);
                            ticket.channelId = null;
                            deletedTickets.set(ticketId, ticket);
                            
                            await dataManager.saveData('closed_tickets', Object.fromEntries(closedTickets));
                            
                            console.log(`✅ تم حذف القناة وحفظ بيانات التذكرة: ${ticketId}`);
                        } catch (error) {
                            console.log('❌ خطأ في حذف الروم:', error);
                        }
                    }, 10000);
                    
                    await interaction.reply({ content: '✅ سيتم حذف الروم بعد 10 ثواني.', ephemeral: true });
                } catch (error) {
                    console.log(`❌ خطأ في الإغلاق النهائي:`, error.message);
                    await interaction.reply({ content: '❌ خطأ في الإغلاق النهائي.', ephemeral: true });
                }
            }
        }

        // ==================== المودالات (Modals) ====================
        
        // مودال التذكرة (فتح تذكرة جديدة)
        else if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_')) {
            const parts = interaction.customId.split('_');
            const categoryKey = parts[2];
            const userId = parts[3];
            const ticketNumber = parseInt(parts[4]);
            
            const category = ticketCategories.get(categoryKey);
            if (!category) {
                return interaction.reply({ content: '❌ القسم ده مش موجود.', ephemeral: true });
            }

            // التحقق من التفاعل أولاً
            try {
                await interaction.deferReply({ ephemeral: true });
            } catch (error) {
                console.log('⚠️ التفاعل انتهت صلاحيته');
                return;
            }

            const answer1 = interaction.fields.getTextInputValue('question1_input');
            const answer2 = interaction.fields.getTextInputValue('question2_input');
            const answer3 = category.questions.optional1 ? interaction.fields.getTextInputValue('question3_input') || 'لم يتم الإجابة' : null;
            const answer4 = category.questions.optional2 ? interaction.fields.getTextInputValue('question4_input') || 'لم يتم الإجابة' : null;
            const answer5 = category.questions.optional3 ? interaction.fields.getTextInputValue('question5_input') || 'لم يتم الإجابة' : null;

            try {
                const guild = interaction.guild;
                const member = interaction.member;
                const ticketId = `${category.name}`;
                const fullTicketId = `${category.name}-${ticketNumber}`;
                
                // إنشاء الروم مع لون
                const statusEmoji = getStatusEmoji(Date.now());
                const ticketChannel = await guild.channels.create({
                    name: `${statusEmoji}・تذكرة-${ticketNumber}`,
                    type: ChannelType.GuildText,
                    parent: category.categoryId,
                    // إضافة اللون كـ flag
                    flags: [1 << 6], // دي flag اللون
                    // اللون نفسه
                    color: getTicketStatusColor(Date.now()), // اللون حسب الوقت
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: [PermissionFlagsBits.ViewChannel],
                        },
                        {
                            id: member.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                            ],
                        },
                        {
                            id: category.roleId,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                            ],
                        }
                    ],
                });

              // إعدادات التذكرة
const ticketData = {
    id: ticketId,
    fullId: fullTicketId,
    number: ticketNumber,
    userId: member.id,
    userName: member.displayName,        // ⭐ الاسم المعروض في السيرفر
    userTag: member.user.tag,            // ⭐ اليوزر نيم (اختياري)
    userAvatar: member.user.displayAvatarURL(),
    category: category.name,
    categoryKey: categoryKey,
    answers: {
        answer1: answer1,
        answer2: answer2,
        answer3: answer3,
        answer4: answer4,
        answer5: answer5
    },
    channelId: ticketChannel.id,
    status: 'مفتوحة',
    openedAt: Date.now(),
    claimedBy: null,
    claimedAt: null,
    claimedByName: null,
    closedBy: null,
    closedAt: null,
    closeReason: null,
    addedAdmins: [],
    userMentions: 0,
    adminMentions: 0,
    messageCount: 0,
    botMessageCount: 0,
    rated: false
};
                activeTickets.set(fullTicketId, ticketData);

                // حفظ البيانات بعد فتح التذكرة
                await dataManager.saveData('active_tickets', Object.fromEntries(activeTickets));
                await dataManager.saveData('counters', Object.fromEntries(ticketCounters));

                // إمبايد التذكرة
                const ticketEmbed = new EmbedBuilder()
                    .setColor(category.color || '#5865F2')
                    .setTitle(`🎫 ${fullTicketId}`)
                    .setDescription(`**تم فتح تذكرة الدعم الفني**\n\n👤 **صاحب التذكرة:** <@${member.id}>\n📂 **القسم:** ${category.name}\n📅 **تاريخ الفتح:** <t:${Math.floor(Date.now() / 1000)}:F>\n📊 **الحالة:** ⏳ في انتظار الاستلام`)
                    .setThumbnail(member.user.displayAvatarURL())
                    .addFields(
                        { name: '📝 إجابات الأسئلة:', value: '────────────────', inline: false },
                        { name: category.questions.required1, value: answer1.substring(0, 1000), inline: false },
                        { name: category.questions.required2, value: answer2.substring(0, 1000), inline: false }
                    )
                    .setFooter({ text: 'سيتم نقل الامبيد لتحت بعد 20 رسالة' })
                    .setTimestamp();

                if (category.categoryBanner) {
                    ticketEmbed.setImage(category.categoryBanner);
                }

                // إضافة الأسئلة الاختيارية للإمبايد
                const optionalAnswers = [
                    { question: category.questions.optional1, answer: answer3 },
                    { question: category.questions.optional2, answer: answer4 },
                    { question: category.questions.optional3, answer: answer5 }
                ];

                optionalAnswers.forEach((item) => {
                    if (item.question && item.answer && item.answer !== 'لم يتم الإجابة') {
                        ticketEmbed.addFields({ 
                            name: item.question, 
                            value: item.answer.substring(0, 1000), 
                            inline: false 
                        });
                    }
                });

                // الأزرار الداخلية
                const claimButton = new ButtonBuilder()
                    .setCustomId(`claim_${fullTicketId}`)
                    .setLabel('استلام التذكرة')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('✅');

                const propertiesButton = new ButtonBuilder()
                    .setCustomId(`properties_${fullTicketId}`)
                    .setLabel('خصائص')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⚙️');

                const row = new ActionRowBuilder().addComponents(claimButton, propertiesButton);

                // إرسال في الروم
                await ticketChannel.send({
                    content: `<@${member.id}> <@&${category.roleId}>`,
                    embeds: [ticketEmbed],
                    components: [row]
                });

                // تأكيد للمستخدم
                const confirmEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ تم فتح تذكرتك بنجاح!')
                    .setDescription(`**${fullTicketId}**\n\nتم فتح تذكرتك في <#${ticketChannel.id}>`)
                    .addFields(
                        { name: '🔗 رابط التذكرة', value: `https://discord.com/channels/${guild.id}/${ticketChannel.id}`, inline: false },
                        { name: '📂 القسم', value: category.name, inline: true },
                        { name: '📅 تاريخ الفتح', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                    )
                    .setFooter({ text: 'شكراً لثقتك بنا - فريق دعم عائلة العمدة' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [confirmEmbed] });

                // رسالة خاصة
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle('🎫 تم فتح تذكرتك بنجاح!')
                        .setDescription(`**${fullTicketId}**\n\nتم فتح تذكرتك بنجاح في قسم ${category.name}`)
                        .addFields(
                            { name: '🔗 رابط التذكرة', value: `https://discord.com/channels/${guild.id}/${ticketChannel.id}`, inline: false },
                            { name: category.questions.required1, value: answer1.substring(0, 300) + (answer1.length > 300 ? '...' : ''), inline: false },
                            { name: category.questions.required2, value: answer2.substring(0, 300) + (answer2.length > 300 ? '...' : ''), inline: false }
                        )
                        .setFooter({ text: 'نظام تذاكر عائلة العمدة - شكراً لثقتك بنا' })
                        .setTimestamp();

                    await member.send({ embeds: [dmEmbed] });
                } catch (dmError) {
                    console.log('❌ مفيش خاص للمستخدم');
                }

                // رسالة للوج
                const logChannel = guild.channels.cache.get(category.logChannelId);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('🎫 تذكرة جديدة مفتوحة')
                        .setDescription(`**${fullTicketId}**`)
                        .addFields(
                            { name: '👤 صاحب التذكرة', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
                            { name: '📂 القسم', value: category.name, inline: true },
                            { name: '#️⃣ الروم', value: `<#${ticketChannel.id}>`, inline: true }
                        )
                        .setThumbnail(member.user.displayAvatarURL())
                        .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed] });
                }

                // لوج عام
                if (botSettings.logChannel) {
                    try {
                        const generalLogChannel = await client.channels.fetch(botSettings.logChannel);
                        if (generalLogChannel) {
                            const generalLogEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setTitle('🎫 تذكرة جديدة')
                                .setDescription(`**${fullTicketId}**\n👤 <@${member.id}>\n📂 ${category.name}`)
                                .setTimestamp();
                            await generalLogChannel.send({ embeds: [generalLogEmbed] });
                        }
                    } catch (e) {}
                }

            } catch (error) {
                console.error('❌ خطأ في فتح التذكرة:', error);
                try {
                    await interaction.editReply({ content: '❌ حصل خطأ في فتح التذكرة.' });
                } catch (e) {
                    console.log('⚠️ التفاعل انتهت صلاحيته');
                }
            }
        }

        // مودال تغيير الاسم
        else if (interaction.isModalSubmit() && interaction.customId.startsWith('rename_modal_')) {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**',
                    ephemeral: true
                });
            }

            const parts = interaction.customId.split('_');
            const ticketId = parts[2];
            const userId = parts[3];
            const newName = interaction.fields.getTextInputValue('new_name');
            const ticket = activeTickets.get(ticketId);
            
            // التحقق من الترستر
            if (interaction.user.id !== userId) {
                return interaction.reply({ 
                    content: '❌ **هذا المودال ليس لك!**',
                    ephemeral: true 
                });
            }
            
            if (ticket) {
                try {
                    const channel = await interaction.guild.channels.fetch(ticket.channelId);
                    await channel.setName(newName);
                    await interaction.reply({ content: `✅ تم تغيير اسم الروم إلى: \`${newName}\``, ephemeral: true });
                } catch (error) {
                    await interaction.reply({ content: '❌ خطأ في تغيير الاسم.', ephemeral: true });
                }
            }
        }

        // مودال إضافة أداري
        else if (interaction.isModalSubmit() && interaction.customId.startsWith('add_admin_modal_')) {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**',
                    ephemeral: true
                });
            }

            const parts = interaction.customId.split('_');
            const ticketId = parts[3];
            const userId = parts[4];
            
            if (interaction.user.id !== userId) {
                return interaction.reply({ 
                    content: '❌ **هذا المودال ليس لك!**',
                    ephemeral: true 
                });
            }

            const adminId = interaction.fields.getTextInputValue('admin_id');
            const ticket = activeTickets.get(ticketId);
            
            if (!ticket) {
                return interaction.reply({ 
                    content: '❌ **التذكرة غير موجودة!**',
                    ephemeral: true 
                });
            }

            try {
                // التحقق من صحة الأيدي
                const admin = await interaction.guild.members.fetch(adminId);
                
                const channel = await interaction.guild.channels.fetch(ticket.channelId);
                await channel.permissionOverwrites.create(admin.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                });
                
                if (!ticket.addedAdmins) {
                    ticket.addedAdmins = [];
                }
                
                if (ticket.addedAdmins.includes(admin.id)) {
                    return interaction.reply({ 
                        content: '❌ **هذا الأدمن مضاف بالفعل!**',
                        ephemeral: true 
                    });
                }
                
                ticket.addedAdmins.push(admin.id);
                ticket.adminMentions = (ticket.adminMentions || 0) + 1;
                activeTickets.set(ticketId, ticket);
                
                await dataManager.saveData('active_tickets', Object.fromEntries(activeTickets));
                
                const adminEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('👨‍💼 تم إضافة أداري')
                    .setDescription(`<@${admin.id}> - تمت إضافته للتذكرة بواسطة <@${interaction.user.id}>`)
                    .addFields(
                        { name: '🏷️ رقم التذكرة', value: ticketId, inline: true },
                        { name: '📂 القسم', value: ticket.category, inline: true }
                    )
                    .setTimestamp();
                
                await interaction.reply({ 
                    content: `✅ تم إضافة <@${admin.id}> للتذكرة.`, 
                    ephemeral: true 
                });
                
                await channel.send({ embeds: [adminEmbed] });
                
            } catch (error) {
                console.error('❌ خطأ في إضافة الأداري:', error);
                
                if (error.code === 50001) {
                    await interaction.reply({ 
                        content: '❌ **لا أملك صلاحية تعديل الصلاحيات في هذا الروم**',
                        ephemeral: true 
                    });
                } else if (error.code === 10013) {
                    await interaction.reply({ 
                        content: '❌ **الروم غير موجود**',
                        ephemeral: true 
                    });
                } else if (error.code === 50035 || error.code === 'InvalidType') {
                    await interaction.reply({ 
                        content: '❌ **الأيدي المدخل غير صالح**',
                        ephemeral: true 
                    });
                } else {
                    await interaction.reply({ 
                        content: '❌ **حدث خطأ في إضافة الأداري**', 
                        ephemeral: true 
                    });
                }
            }
        }

        // مودال إغلاق التذكرة
        else if (interaction.isModalSubmit() && interaction.customId.startsWith('close_modal_')) {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ **عذراً، أنت لست من فريق الدعم!**',
                    ephemeral: true 
                });
            }

            const parts = interaction.customId.split('_');
            const ticketId = parts[2];
            const userId = parts[3];
            
            if (interaction.user.id !== userId) {
                return interaction.reply({ 
                    content: '❌ **هذا المودال ليس لك!**',
                    ephemeral: true 
                });
            }

            const reason = interaction.fields.getTextInputValue('close_reason') || 'لم يتم تحديد سبب';
            const ticket = activeTickets.get(ticketId);
            
            if (!ticket) {
                return interaction.reply({ 
                    content: '❌ **التذكرة غير موجودة!**',
                    ephemeral: true 
                });
            }

            try {
                // تحديث بيانات التذكرة
                ticket.status = 'مغلقة';
                ticket.closedBy = interaction.user.id;
                ticket.closedAt = Date.now();
                ticket.closeReason = reason;
                
                // نقل من نشطة إلى مغلقة
                activeTickets.delete(ticketId);
                closedTickets.set(ticketId, ticket);
                
                // حفظ البيانات
                await dataManager.saveData('active_tickets', Object.fromEntries(activeTickets));
                await dataManager.saveData('closed_tickets', Object.fromEntries(closedTickets));

                // إرسال رسالة الإغلاق
                const closeEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🔒 تم إغلاق التذكرة')
                    .setDescription(`**${ticketId}**\n\n👤 **صاحب التذكرة:** <@${ticket.userId}>\n👨‍💼 **تم الإغلاق بواسطة:** <@${interaction.user.id}>`)
                    .addFields(
                        { name: '📅 تاريخ الفتح', value: `<t:${Math.floor(ticket.openedAt / 1000)}:F>`, inline: true },
                        { name: '📅 تاريخ الإغلاق', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                        { name: '📝 سبب الإغلاق', value: reason, inline: false }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [closeEmbed] });

                // ⭐ أزرار التحكم النهائية
                const reopenButton = new ButtonBuilder()
                    .setCustomId(`reopen_${ticketId}`)
                    .setLabel('إعادة فتح الكتابة')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📝');

                const closeWriteButton = new ButtonBuilder()
                    .setCustomId(`close_write_${ticketId}`)
                    .setLabel('إغلاق الكتابة')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔏');

                const finalCloseButton = new ButtonBuilder()
                    .setCustomId(`final_close_${ticketId}`)
                    .setLabel('🗑️ إغلاق نهائي')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⚠️');

                const row = new ActionRowBuilder().addComponents(reopenButton, closeWriteButton, finalCloseButton);
                await interaction.channel.send({ content: '**⚙️ أزرار التحكم النهائية:**', components: [row] });

                // ⭐ حساب مدة التذكرة
                const duration = Math.floor((ticket.closedAt - ticket.openedAt) / 1000);
                const minutes = Math.floor(duration / 60);
                const seconds = duration % 60;

                // ⭐ الحصول على بيانات القسم
                const category = ticketCategories.get(ticket.categoryKey);

                // ⭐ إرسال رسالة خاصة للمستخدم (إشعار الإغلاق + التقييم)
                try {
                    const member = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
                    if (member) {
                        await sendTicketToUser(ticket, category, member.user, interaction.user.id);
                        console.log(`✅ تم إرسال رسالة الإغلاق والتقييم للمستخدم ${member.user.tag}`);
                    } else {
                        console.log(`❌ العضو ${ticket.userId} مش موجود في السيرفر`);
                    }
                } catch (dmError) {
                    console.log('❌ لا يمكن إرسال رسالة خاصة للمستخدم:', dmError);
                }

       // ⭐ رسالة اللوج في قناة القسم
if (category && category.logChannelId) {
    try {
        const logChannel = interaction.guild.channels.cache.get(category.logChannelId);
        if (logChannel) {
            
            // جلب الأسماء المعروضة في السيرفر
            const ticketOwner = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
            const ticketOwnerName = ticketOwner ? ticketOwner.displayName : ticket.userName;
            
            const claimedByMember = ticket.claimedBy ? await interaction.guild.members.fetch(ticket.claimedBy).catch(() => null) : null;
            const claimedByName = claimedByMember ? claimedByMember.displayName : (ticket.claimedByName || 'لم يتم الاستلام');
            
            const closedByMember = interaction.member;
            const closedByName = closedByMember.displayName;
            
            // إنشاء رابط النسخة للأزرار
            let transcriptUrls = null;
            try {
                transcriptUrls = await createTranscriptUrl(ticket, category, interaction.user.id);
                console.log(`✅ تم إنشاء رابط النسخة للوج: ${ticketId}`);
            } catch (urlError) {
                console.log(`⚠️ لا يمكن إنشاء رابط النسخة:`, urlError.message);
            }
            
            const logEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔒 تذكرة مغلقة')
                .setDescription(`**${ticketId}**`)
                .addFields(
                    { name: '👤 صاحب التذكرة', value: `<@${ticket.userId}> (${ticketOwnerName})`, inline: true },
                    { name: '👨‍💼 تم الاستلام بواسطة', value: ticket.claimedBy ? `<@${ticket.claimedBy}> (${claimedByName})` : 'لم يتم الاستلام', inline: true },
                    { name: '👨‍💼 تم الإغلاق بواسطة', value: `<@${interaction.user.id}> (${closedByName})`, inline: true },
                    { name: '📝 سبب الإغلاق', value: reason, inline: false },
                    { name: '📊 إحصائيات', value: `• استدعاءات المستخدم: ${ticket.userMentions || 0}\n• استدعاءات الأداريين: ${ticket.adminMentions || 0}\n• عدد الرسائل: ${ticket.messageCount || 0}\n• عدد الأداريين المضافين: ${ticket.addedAdmins?.length || 0}\n• مدة التذكرة: ${minutes} دقيقة ${seconds} ثانية`, inline: false }
                )
                .setTimestamp();
            
            // إضافة أزرار المعاينة والتحميل لو موجودة
            if (transcriptUrls) {
                const actionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('👁️ معاينة المحادثة')
                        .setStyle(ButtonStyle.Link)
                        .setURL(transcriptUrls.preview)
                        .setEmoji('👁️'),
                    new ButtonBuilder()
                        .setLabel('📥 تحميل المحادثة')
                        .setStyle(ButtonStyle.Link)
                        .setURL(transcriptUrls.download)
                        .setEmoji('📥')
                );
                
                await logChannel.send({ 
                    embeds: [logEmbed], 
                    components: [actionRow] 
                });
                console.log(`✅ تم إرسال لوج الإغلاق مع الأزرار إلى القناة ${category.logChannelId}`);
            } else {
                await logChannel.send({ embeds: [logEmbed] });
                console.log(`✅ تم إرسال لوج الإغلاق إلى القناة ${category.logChannelId}`);
            }
        }
    } catch (e) {
        console.log('⚠️ خطأ في إرسال لوج الإغلاق:', e.message);
    }
}

} catch (error) {
    console.error('❌ خطأ في إغلاق التذكرة:', error);
    const errorMessage = error.message || 'حدث خطأ غير معروف';
    
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: `❌ حدث خطأ في إغلاق التذكرة: ${errorMessage}` });
    } else {
        await interaction.reply({ 
            content: `❌ حدث خطأ في إغلاق التذكرة: ${errorMessage}`, 
            ephemeral: true 
        });
    }
}
        }

        // مودال التعليق (التقييم مع التعليق)
        else if (interaction.isModalSubmit() && interaction.customId.startsWith('comment_modal_')) {
            await interaction.deferReply({ ephemeral: true });
            
            const parts = interaction.customId.split('_');
            const ticketId = parts[2];
            const rating = parseInt(parts[3]);
            const userId = parts[4];
            
            // التحقق من أن المستخدم هو نفسه صاحب التقييم
            if (interaction.user.id !== userId) {
                return interaction.editReply({ 
                    content: '❌ **هذا التقييم ليس لك!**' 
                });
            }
            
            const comment = interaction.fields.getTextInputValue('comment') || 'لا يوجد تعليق';
            
            console.log(`💬 استلام تقييم للتذكرة ${ticketId}: ${rating} نجوم - تعليق: ${comment.substring(0, 50)}...`);
            
            let ticket = closedTickets.get(ticketId) || deletedTickets.get(ticketId) || activeTickets.get(ticketId);
            
            if (!ticket) {
                return interaction.editReply({ 
                    content: '❌ **لا يمكن العثور على بيانات التذكرة**\nربما تم حذفها من النظام'
                });
            }
        
            // تحديث بيانات التذكرة
            ticket.rated = true;
            ticket.rating = rating;
            ticket.comment = comment;
            ticket.ratedAt = Date.now();
            ticket.ratedBy = interaction.user.tag;
            
            // حفظ البيانات حسب مكان التذكرة
            if (closedTickets.has(ticketId)) {
                closedTickets.set(ticketId, ticket);
                await dataManager.saveData('closed_tickets', Object.fromEntries(closedTickets));
            } else if (deletedTickets.has(ticketId)) {
                deletedTickets.set(ticketId, ticket);
            } else if (activeTickets.has(ticketId)) {
                activeTickets.set(ticketId, ticket);
                await dataManager.saveData('active_tickets', Object.fromEntries(activeTickets));
            }
        
            // محاولة إنشاء رابط نسخة HTML للتذكرة
            let transcriptUrls = null;
            try {
                const category = ticketCategories.get(ticket.categoryKey);
                if (category) {
                    transcriptUrls = await createTranscriptUrl(ticket, category, ticket.closedBy);
                    console.log(`✅ تم إنشاء رابط النسخة للتقييم: ${ticketId}`);
                }
            } catch (urlError) {
                console.log(`⚠️ لا يمكن إنشاء رابط النسخة:`, urlError.message);
            }
        
            // إرسال التقييم مع التعليق إلى قناة التقييمات
            if (botSettings.ratingChannel) {
                try {
                    const ratingChannel = await client.channels.fetch(botSettings.ratingChannel);
                    if (ratingChannel) {
                        const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
                        
                        let adminName = ticket.claimedByName || 'لم يتم الاستلام';
                        
                        const ratingEmbed = new EmbedBuilder()
                            .setColor('#FFD700')
                            .setTitle('⭐ تقييم جديد')
                            .setDescription(`**تم استلام تقييم جديد للتذكرة**`)
                            .addFields(
                                { name: '🏷️ التذكرة', value: `\`${ticketId}\``, inline: false },
                                { name: '👤 صاحب التذكرة', value: `<@${ticket.userId}> (${ticket.userName})`, inline: true },
                                { name: '👨‍💼 المسؤول', value: adminName, inline: true },
                                { name: '📊 التقييم', value: stars, inline: true },
                                { name: '📂 القسم', value: ticket.category || 'غير محدد', inline: true },
                                { name: '💬 التعليق', value: comment.length > 100 ? comment.substring(0, 100) + '...' : comment, inline: false }
                            )
                            .setFooter({ text: `تم التقييم بواسطة ${interaction.user.tag}` })
                            .setTimestamp();
                        
                        // إضافة رابط النسخة لو موجود
                        if (transcriptUrls) {
                            ratingEmbed.addFields({
                                name: '🔗 نسخة المحادثة',
                                value: `[👁️ معاينة](${transcriptUrls.preview}) • [📥 تحميل](${transcriptUrls.download})`,
                                inline: false
                            });
                        }
                        
                        // إضافة صورة مصغرة لو موجودة
                        if (ticket.userAvatar) {
                            ratingEmbed.setThumbnail(ticket.userAvatar);
                        }
                        
                        await ratingChannel.send({ embeds: [ratingEmbed] });
                        console.log(`✅ تم إرسال التقييم إلى القناة ${botSettings.ratingChannel}`);
                    }
                } catch (error) {
                    console.error('❌ خطأ في إرسال التقييم:', error);
                }
            }
        
            // إرسال إشعار للمسؤول عن التذكرة (لو موجود)
            if (ticket.claimedBy) {
                try {
                    const adminMember = await interaction.guild.members.fetch(ticket.claimedBy).catch(() => null);
                    if (adminMember && adminMember.id !== interaction.user.id) {
                        const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
                        
                        const adminNotifyEmbed = new EmbedBuilder()
                            .setColor('#FFD700')
                            .setTitle('📊 تقييم جديد لتذكرتك')
                            .setDescription(`**تم تقييم التذكرة ${ticketId}**`)
                            .addFields(
                                { name: '⭐ التقييم', value: stars, inline: true },
                                { name: '👤 من', value: interaction.user.tag, inline: true },
                                { name: '💬 التعليق', value: comment, inline: false }
                            )
                            .setTimestamp();
                        
                        await adminMember.send({ embeds: [adminNotifyEmbed] }).catch(() => {});
                        console.log(`✅ تم إرسال إشعار التقييم للمسؤول ${adminMember.user.tag}`);
                    }
                } catch (adminError) {
                    console.log(`⚠️ لا يمكن إرسال إشعار للمسؤول:`, adminError.message);
                }
            }
        
            // تجهيز رسالة التأكيد للمستخدم
            const stars = '⭐'.repeat(rating);
            const confirmDescription = [
                `**تم تسجيل تقييمك بنجاح** ✅`,
                ``,
                `🏷️ **رقم التذكرة:** \`${ticketId}\``,
                `⭐ **تقييمك:** ${stars}`,
                `💬 **تعليقك:** ${comment}`,
                `📅 **تاريخ التقييم:** <t:${Math.floor(Date.now() / 1000)}:R>`,
                ``,
                `**شكراً لثقتك بنا** 🙏`
            ].join('\n');
        
            const confirmEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ شكراً لك على التقييم!')
                .setDescription(confirmDescription)
                .setFooter({ text: 'نظام تذاكر عائلة العمدة' })
                .setTimestamp();
        
            // إضافة روابط النسخة لو موجودة
            if (transcriptUrls) {
                const buttonRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('👁️ معاينة المحادثة')
                            .setStyle(ButtonStyle.Link)
                            .setURL(transcriptUrls.preview)
                            .setEmoji('👁️'),
                        new ButtonBuilder()
                            .setLabel('📥 تحميل المحادثة')
                            .setStyle(ButtonStyle.Link)
                            .setURL(transcriptUrls.download)
                            .setEmoji('📥')
                    );
                
                await interaction.editReply({ 
                    embeds: [confirmEmbed], 
                    components: [buttonRow]
                });
            } else {
                await interaction.editReply({ 
                    embeds: [confirmEmbed]
                });
            }
        
            console.log(`✅ تم اكتمال تقييم التذكرة ${ticketId} بنجاح`);
        }

        // Autocomplete للأقسام
        else if (interaction.isAutocomplete()) {
            if (interaction.commandName === 'حذف-قسم' || interaction.commandName === 'تعديل-قسم') {
                const focusedValue = interaction.options.getFocused().toLowerCase();
                const choices = Array.from(ticketCategories.keys());
                const filtered = choices.filter(choice => choice.includes(focusedValue)).slice(0, 25);
                await interaction.respond(
                    filtered.map(choice => ({ name: choice, value: choice }))
                );
            }
        }

    } catch (error) {
        console.error('❌ خطأ في التفاعل:', error);
        
        if (error.code === 10062 || error.code === '10062') {
            console.log('⚠️ التفاعل انتهت صلاحيته، سيتم تجاهله.');
            return;
        }
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ 
                    content: '❌ حصل خطأ في المعالجة.', 
                    ephemeral: true 
                }).catch(() => {});
            } else {
                await interaction.reply({ 
                    content: '❌ حصل خطأ في المعالجة.', 
                    ephemeral: true 
                }).catch(() => {});
            }
        } catch (e) {
            console.log('⚠️ لا يمكن الرد على التفاعل');
        }
    }
});

// زيادة عدد الرسائل ونقل الامبيد
client.on('messageCreate', async (message) => {
    if (message.channel.type !== 0 || message.author.bot) return;
    
    for (const [ticketId, ticket] of activeTickets) {
        if (ticket.channelId === message.channel.id) {
            ticket.messageCount++;
            
            const count = (messageCounter.get(ticketId) || 0) + 1;
            messageCounter.set(ticketId, count);
            
            if (count >= 20) {
                await moveEmbedToBottom(message.channel, ticketId);
                messageCounter.set(ticketId, 0);
            }
            
            setTimeout(async () => {
                await dataManager.saveData('active_tickets', Object.fromEntries(activeTickets));
            }, 1000);
            break;
        }
    }
});

// تحديث أسماء الرومات كل 20 دقيقة
setInterval(async () => {
    console.log('🔄 تحديث أسماء الرومات...');
    
    for (const [ticketId, ticket] of activeTickets) {
        if (ticket.status === 'مفتوحة') {
            try {
                const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
                if (!channel) continue;
                
                // حساب الوقت المنقضي بالساعات
                const waitingHours = (Date.now() - ticket.openedAt) / (1000 * 60 * 60);
                
                // جلب الإيموجي المناسب
                const emoji = getStatusEmoji(ticket.openedAt);
                
                // اسم نظيف بدون إيموجي قديم
                const cleanName = `تذكرة-${ticket.number}`;
                const newName = `${emoji}・${cleanName}`;
                
                // غير الاسم لو مختلف
                if (channel.name !== newName) {
                    await channel.setName(newName);
                    console.log(`✅ ${ticketId}: ${emoji} (${waitingHours.toFixed(1)} ساعة)`);
                }
                
            } catch (error) {
                console.log(`⚠️ خطأ:`, error.message);
            }
        }
    }
}, 20 * 60 * 1000); // كل 20 دقيقة
// توكن البوت
client.login(process.env.DISCORD_TOKEN);