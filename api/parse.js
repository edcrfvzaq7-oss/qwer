const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const agent = new https.Agent({ rejectUnauthorized: false });

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    let { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Need URL' });
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;

    try {
        const response = await axios.get(url, {
            httpsAgent: agent,
            // 【核心修改】伪装成百度搜索引擎爬虫，绝大多数网站会放行
            headers: { 
                'User-Agent': 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
                'Accept': '*/*',
                'Referer': url
            },
            // 告诉 axios 返回二进制数据，防止自动转码导致乱码
            responseType: 'arraybuffer', 
            timeout: 10000
        });
        
        // 简单处理编码：将二进制转为字符串 (默认 UTF-8)
        let html = response.data.toString('utf-8');
        
        // 如果发现包含大量乱码（检测到常见GBK特征），尝试“暴力”修正
        // 注意：这只是简易处理，Node环境不装 iconv-lite 很难完美处理GBK
        // 但大部分新小说站都是 UTF-8 的
        
        const $ = cheerio.load(html);
        let title = $('h1').text() || $('title').text();
        
        // --- 提取逻辑 ---
        // 移除常见干扰元素
        $('script, style, iframe, a').remove();

        let content = null;
        
        // 1. 尝试常见 ID
        const ids = ['#content', '.content', '#chapter-content', '.read-content', '#text', '.txtnav'];
        for (let id of ids) {
            let el = $(id);
            if (el.length > 0 && el.text().trim().length > 100) {
                content = el.html();
                break;
            }
        }

        // 2. 暴力扫描：找字数最多的块
        if (!content) {
            let maxLen = 0;
            $('div').each((i, el) => {
                let text = $(el).text().trim();
                if (text.length > maxLen) {
                    maxLen = text.length;
                    content = $(el).html();
                }
            });
        }

        if (!content || content.length < 50) {
            // 如果还是失败，把抓取到的 HTML 标题返回去，方便调试看看到底抓到了啥
            throw new Error(`未找到正文。网站返回的标题是: [${title.trim()}]。可能依然被拦截。`);
        }

        // 简单排版
        content = content.replace(/<br\s*\/?>/gi, '\n').replace(/&nbsp;/g, ' ');

        // 构造 JSON 返回
        // 手动设置 Content-Type 确保中文不乱码
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ title: title.trim(), content: content }));

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
