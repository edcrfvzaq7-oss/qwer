const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    // 允许跨域
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Need URL' });

    try {
        // 1. 伪装更强的请求头 (模拟电脑浏览器)
        const response = await axios.get(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': url 
            },
            timeout: 10000 // 10秒超时
        });
        
        const $ = cheerio.load(response.data);
        let title = $('h1').text() || $('title').text();
        let content = null;

        // --- 方案 A: 常见规则匹配 (优先尝试) ---
        const selectors = [
            '#content', '.content', '#chapter-content', '.read-content', 
            '#text', '.txtnav', '#article', '.article-content'
        ];
        
        for (let sel of selectors) {
            if ($(sel).length > 0) {
                // 简单的防误判：如果字数太少（比如只有“下一页”几个字），就不算
                if ($(sel).text().trim().length > 100) {
                    content = $(sel).html();
                    break;
                }
            }
        }

        // --- 方案 B: 暴力扫描 (如果方案A失败) ---
        // 逻辑：遍历页面所有 div 和 article，找出包含中文字符最多、最长的那个
        if (!content) {
            let maxLen = 0;
            $('div, article, section').each((i, el) => {
                // 移除 script 和 style 后的纯文本
                const text = $(el).clone().children().remove().end().text().trim(); 
                if (text.length > maxLen) {
                    maxLen = text.length;
                    content = $(el).html();
                }
            });
        }

        if (!content || content.length < 50) {
            throw new Error('未找到正文，该网站可能使用了反爬虫或加密技术');
        }

        // --- 数据清洗 ---
        content = content
            .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '') // 杀脚本
            .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')   // 杀样式
            .replace(/<a[\s\S]*?>[\s\S]*?<\/a>/gi, '')           // 杀广告链接
            .replace(/&nbsp;/g, ' ')
            .replace(/<br\s*\/?>/gi, '\n'); // 换行标准化

        res.json({ title: title.trim(), content: content });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '抓取失败: ' + error.message });
    }
};
