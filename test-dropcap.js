const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body><div class="title"><h1><p>Title</p></h1></div><p>- Hello</p></body>');
const firstP = Array.from(dom.window.document.body.children).find(el => el.tagName.toLowerCase() === 'p');
console.log(firstP ? firstP.outerHTML : "Not found");
