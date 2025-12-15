const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
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
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1' }
        });
        
        const $ = cheerio.load(response.data);
        // 智能识别正文
        let content = $('#content').html() || $('.content').html() || $('#chapter-content').html() || $('.read-content').html() || $('article').html();
        let title = $('h1').text();

        if (!content) throw new Error('无法识别正文');

        // 清洗
        content = content.replace(/<script.*?>.*?<\/script>/gi, '')
                         .replace(/<style.*?>.*?<\/style>/gi, '')
                         .replace(/<a.*?>.*?<\/a>/gi, '');

        res.json({ title: title.trim(), content: content });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
