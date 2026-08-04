const puppeteer = require('puppeteer');

// Biến lưu cache thống kê để không phải mở trang cào liên tục mất thời gian
let cachedStats = {
    fb: "🔴 Hết lượt (Chờ back mã khung giờ tới)",
    ig: "🔴 Hết lượt (Chờ back mã khung giờ tới)",
    lastUpdated: 0
};

async function getSpecificCodeStatsFast(browser) {
    const now = Date.now();
    // Cache lại 5 giây để cực kỳ tối ưu tốc độ nếu khách dồn dập gửi link
    if (now - cachedStats.lastUpdated < 5000 && cachedStats.lastUpdated !== 0) {
        return cachedStats;
    }

    let scrapePage = null;
    try {
        scrapePage = await browser.newPage();
        await scrapePage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        await scrapePage.setCacheEnabled(false);
        
        await scrapePage.goto('https://hyggesansale.com/shopee-facebook', { waitUntil: 'domcontentloaded', timeout: 10000 });
        await new Promise(r => setTimeout(r, 800));

        const statsData = await scrapePage.evaluate(() => {
            let fbInfo = "🔴 Hết lượt (Chờ back mã khung giờ tới)";
            let igInfo = "🔴 Hết lượt (Chờ back mã khung giờ tới)";

            const fullText = document.body.innerText || "";
            const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

            let currentSection = '';
            for (let i = 0; i < lines.length; i++) {
                let lineUpper = lines[i].toUpperCase();

                if (lineUpper.includes('FACEBOOK') || lineUpper.includes('METAPARAUG')) {
                    currentSection = 'FB';
                } else if (lineUpper.includes('INSTAGRAM') || lineUpper.includes('METAPARIG')) {
                    currentSection = 'IG';
                }

                const matchPercent = lines[i].match(/(\d+%\s*đã dùng)/i);
                if (matchPercent) {
                    let hasAvaliability = false;
                    for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 3); j++) {
                        if (lines[j].toUpperCase().includes('CÒN LƯỢT')) {
                            hasAvaliability = true;
                            break;
                        }
                    }

                    if (currentSection === 'FB' && fbInfo.includes('Hết lượt')) {
                        fbInfo = hasAvaliability ? `🟢 Còn lượt (${matchPercent[1]})` : `🔴 Hết lượt (${matchPercent[1]})`;
                    } else if (currentSection === 'IG' && igInfo.includes('Hết lượt')) {
                        igInfo = hasAvaliability ? `🟢 Còn lượt (${matchPercent[1]})` : `🔴 Hết lượt (${matchPercent[1]})`;
                    }
                }
            }

            const allPercents = fullText.match(/(\d+%\s*đã dùng)/ig);
            if (allPercents && allPercents.length >= 2) {
                if (fbInfo.includes('Hết lượt')) {
                    fbInfo = `🟢 Còn lượt (${allPercents[0]})`;
                }
                if (igInfo.includes('Hết lượt')) {
                    igInfo = `🟢 Còn lượt (${allPercents[allPercents.length - 1]})`;
                }
            }

            return { fb: fbInfo, ig: igInfo };
        });

        await scrapePage.close();
        cachedStats = { ...statsData, lastUpdated: Date.now() };
        return cachedStats;
    } catch (error) {
        if (scrapePage) {
            try { await scrapePage.close(); } catch(e){}
        }
        return cachedStats;
    }
}

async function convertAndGetInfoFast(browser, originalUrl) {
    let convPage = null;
    try {
        convPage = await browser.newPage();
        await convPage.goto('https://ngocmafb.afp.ad/facebook', { waitUntil: 'domcontentloaded', timeout: 10000 });
        await convPage.waitForSelector('input', { timeout: 3000 });
        
        await convPage.click('input');
        await convPage.keyboard.down('Control');
        await convPage.keyboard.press('A');
        await convPage.keyboard.up('Control');
        await convPage.keyboard.press('Backspace');

        await convPage.type('input', originalUrl, { delay: 10 });

        await convPage.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], .btn'));
            for (let btn of buttons) {
                const text = btn.innerText || btn.value || '';
                if (text.includes('Chuyển đổi') || text.includes('Rút gọn') || text.includes('Tạo') || text.includes('Lấy link')) {
                    btn.click();
                    return;
                }
            }
            if (buttons.length > 0) buttons[0].click();
        });

        await new Promise(r => setTimeout(r, 1200));

        let finalShortLink = await convPage.evaluate((orig) => {
            const links = Array.from(document.querySelectorAll('a'));
            for (let a of links) {
                const href = a.href || '';
                if (href.includes('s.afp.ad/') && href !== orig) {
                    return href;
                }
            }
            const inputs = document.querySelectorAll('input[type="text"], textarea');
            for (let inp of inputs) {
                const val = inp.value || '';
                if (val.includes('s.afp.ad/')) {
                    return val;
                }
            }
            const match = document.body.innerHTML.match(/(https?:\/\/s\.afp\.ad\/[A-Za-z0-9_-]+)/);
            return match ? match[1] : null;
        }, originalUrl);

        await convPage.close();
        return finalShortLink && finalShortLink.includes('s.afp.ad') ? finalShortLink : originalUrl;
    } catch (error) {
        if (convPage) {
            try { await convPage.close(); } catch(e){}
        }
        return originalUrl;
    }
}

async function startWebBot() {
    console.log('-------------------------------------------');
    console.log('   ĐANG KHỞI ĐỘNG TRÌNH DUYỆT TỐC ĐỘ CAO...  ');
    console.log('-------------------------------------------');

    const browser = await puppeteer.launch({ 
        headless: false,
        defaultViewport: null,
        args: [
            '--start-maximized', 
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    const context = browser.defaultBrowserContext();
    await context.overridePermissions('https://chat.zalo.me', ['clipboard-read', 'clipboard-write']);

    console.log('Đang truy cập Zalo Web...');
    await page.goto('https://chat.zalo.me/', { waitUntil: 'networkidle2' });

    try {
        await page.waitForSelector('#contact-search-input, .fa.fa-search, input[placeholder*="Tìm kiếm"]', { timeout: 120000 });
        console.log('Đã đăng nhập Zalo Web thành công!');
    } catch (e) {}

    await new Promise(r => setTimeout(r, 2000));

    const targetGroupNames = ["Test box", "Chatbot Áp Mã Shopee"]; 

    console.log('-------------------------------------------');
    console.log('   BOT ĐÃ SẴN SÀNG CHẠY TỐC ĐỘ THẦN TỐC!    ');
    console.log('-------------------------------------------');

    await page.exposeFunction('processShopeeLinkInCurrentChat', async (linkNodeSelector, groupName) => {
        console.log(`\n===========================================`);
        console.log(`[${groupName}] TĂNG TỐC XỬ LÝ LINK CHO KHÁCH`);

        try {
            const element = await page.$(linkNodeSelector);
            if (element) {
                await element.hover();
                await new Promise(r => setTimeout(r, 100));
            }
        } catch(err) {}

        // Bấm reply nhanh gọn
        await page.evaluate((sel) => {
            try {
                const msgItem = document.querySelector(sel);
                if (!msgItem) return;
                const allIcons = msgItem.querySelectorAll('div, span, button, i');
                for (let el of allIcons) {
                    const title = (el.getAttribute('title') || '').toLowerCase();
                    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                    if (title.includes('trả lời') || title.includes('reply') || ariaLabel.includes('trả lời') || ariaLabel.includes('reply')) {
                        el.click();
                        return;
                    }
                }
            } catch(e) {}
        }, linkNodeSelector);

        const originalUrl = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return '';
            const match = el.innerText.match(/(https?:\/\/(?:(?:s\.|vn\.)?shopee\.[a-z.]+|vn\.shp\.ee)\/[A-Za-z0-9_-]+)/i);
            return match ? match[0] : '';
        }, linkNodeSelector);

        if (!originalUrl) return;

        // Chạy song song 100% việc rút gọn link và cào thống kê
        const [convertedLink, stats] = await Promise.all([
            convertAndGetInfoFast(browser, originalUrl),
            getSpecificCodeStatsFast(browser)
        ]);

        const cleanLink = "‎" + convertedLink; 
        
        const fullMessage = "👉 Link áp mã của đại ca đây:\n" + cleanLink + "\n\n" +
            "📊 Thông tin % mã giảm giá:\n" +
            "🔴 Mã 22% Facebook: " + stats.fb + "\n" +
            "🔴 Mã 22% Instagram: " + stats.ig + "\n\n" +
            "✅ MÃ CÓ LẠI ĐỢT MỚI LÚC: 0H - 9H - 15H - 20H mỗi ngày (nếu hết mã, khách canh các giờ có mã lại này mua ngay)\n\n" +
            "✅ Lưu ý: đơn hàng ít nhất 50k mới áp được mã (ai không thấy mã, cập nhập app shopee mới nhất lên HOẶC đổi acc shopee khác mua)\n\n" +
            "⏩ Ai cần hỗ trợ vấn đề gì, nhắn riêng cho admin trưởng hoặc phó nhóm chỉ cho dễ nè";

        await page.evaluate(async (msg) => {
            const inputElem = document.querySelector('.input-editor, div[contenteditable="true"]');
            if (inputElem) {
                inputElem.focus();
                try { await navigator.clipboard.writeText(msg); } catch(e) {}
                const dt = new DataTransfer();
                dt.setData('text/plain', msg);
                inputElem.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
            }
        }, fullMessage);

        await new Promise(r => setTimeout(r, 200));
        await page.keyboard.press('Enter');
        console.log(`--> ĐÃ PHẢN HỒI THẦN TỐC VÀO NHÓM: [${groupName}]!`);
        console.log('===========================================');
    });

    await page.evaluate(async (groupsToWatch) => {
        window.processedLinksSet = new Set();
        window.isGroupSwitchingBusy = false;

        async function switchToGroup(groupName) {
            try {
                const searchInput = document.querySelector('#contact-search-input, input[placeholder*="Tìm kiếm"]');
                if (!searchInput) return false;

                searchInput.click();
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                nativeInputValueSetter.call(searchInput, '');
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));

                nativeInputValueSetter.call(searchInput, groupName);
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                
                await new Promise(r => setTimeout(r, 400)); // Rút ngắn thời gian tìm nhóm

                const convItems = Array.from(document.querySelectorAll('.conv-item, .item-name, .n-scroll-content .truncate'));
                for (let item of convItems) {
                    if ((item.innerText || '').trim().toLowerCase().includes(groupName.toLowerCase())) {
                        let clickable = item.closest('.conv-item') || item;
                        clickable.click();
                        await new Promise(r => setTimeout(r, 300));
                        return true;
                    }
                }
            } catch (e) {}
            return false;
        }

        let currentIndex = 0;
        setInterval(async () => {
            if (window.isGroupSwitchingBusy) return;
            window.isGroupSwitchingBusy = true;

            try {
                const currentGroup = groupsToWatch[currentIndex];
                await switchToGroup(currentGroup);

                const messageElements = Array.from(document.querySelectorAll('.message-item, .card-message, .chat-message, [id^="msg-"]'));
                
                for (let i = messageElements.length - 1; i >= 0; i--) {
                    const msgEl = messageElements[i];
                    const text = msgEl.innerText || '';
                    
                    const isMyMessage = msgEl.classList.contains('card-orange') || 
                                        msgEl.classList.contains('is-send') || 
                                        msgEl.querySelector('.card-orange') || 
                                        text.includes('TĂNG TỐC') || 
                                        text.includes('Link áp mã của đại ca đây') ||
                                        text.includes('Thông tin % mã giảm giá');
                    if (isMyMessage) continue;

                    const shopeeRegex = /(https?:\/\/(?:(?:s\.|vn\.)?shopee\.[a-z.]+|vn\.shp\.ee)\/[A-Za-z0-9_-]+)/gi;
                    const matches = text.match(shopeeRegex);

                    if (matches && matches.length > 0) {
                        const link = matches[0];
                        if (link.includes('s.afp.ad')) continue;
                        if (window.processedLinksSet.has(link)) continue;

                        window.processedLinksSet.add(link);

                        msgEl.classList.add('bot-target-msg-' + Date.now());
                        const selector = '.' + msgEl.className.split(' ').pop();

                        await window.processShopeeLinkInCurrentChat(selector, currentGroup);
                        break; 
                    }
                }
            } catch (err) {
            } finally {
                currentIndex = (currentIndex + 1) % groupsToWatch.length;
                window.isGroupSwitchingBusy = false;
            }

        }, 1500); // Giảm chu kỳ quét xuống 1.5 giây để tóm link ngay lập tức

    }, targetGroupNames);
}

startWebBot();