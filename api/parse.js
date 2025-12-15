const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https'); // 引入 https 模块

// 创建一个忽略 SSL 证书错误的代理 (专门对付配置烂的小说站)
const agent = new https.Agent({  
  rejectUnauthorized: false
});

module.exports = async (req, res) => {
    // 允许跨域
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    let { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Need URL' });

    // 自动补全 http (如果用户忘了写)
    if (!/^https?:\/\//i.test(url)) {
        url = 'http://' + url;
    }

    try {
        console.log(`正在尝试抓取: ${url}`); // 方便看日志

        const response = await axios.get(url, {
            // 关键设置：忽略证书错误，防止握手失败导致 ECONNRESET
            httpsAgent: agent,
            headers: { 
                // 伪装成普通的 Windows 电脑
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                // 加上 Referer，有些网站会检查这个
                'Referer': new URL(url).origin,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9'
            },
            timeout: 15000 // 延长超时到 15秒
        });
        
        const $ = cheerio.load(response.data);
        
        // --- 提取逻辑 ---
        let title = $('h1').text() || $('title').text();
        
        // 1. 优先匹配常见 ID
        let content = $('#content').html() || $('.content').html() || $('#chapter-content').html() || $('.read-content').html() || $('#text').html();

        // 2. 暴力扫描：如果找不到，找字数最多的 div
        if (!content || $(content).text().trim().length < 50) {
            let maxLen = 0;
            $('div, article').each((i, el) => {
                // 排除 hidden 的元素
                if($(el).css('display') === 'none') return;
                
                const text = $(el).text().trim();
                if (text.length > maxLen) {
                    maxLen = text.length;
                    content = $(el).html();
                }
            });
        }

        if (!content) throw new Error('未找到正文内容');

        // --- 清洗 ---
        content = content
            .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '') 
            .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<p>/gi, '\n').replace(/<\/p>/gi, ''); // 处理 p 标签

        res.json({ title: title.trim(), content: content });

    } catch (error) {
        console.error(error);
        // 返回详细错误信息
        res.status(500).json({ 
            error: `抓取失败 (${error.code || error.message})。可能是该网站屏蔽了国外IP，建议换一个网站源尝试。` 
        });
    }
};
