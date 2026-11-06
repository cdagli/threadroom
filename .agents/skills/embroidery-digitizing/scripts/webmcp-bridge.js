// Threadroom WebMCP bridge for agents that drive Chrome through a JavaScript-eval tool
// (e.g. Claude in Chrome `javascript_tool`). Paste this file's contents once per tab, then:
//   await __setup();                       // (re)discover tools
//   await __J('get_design', {});          // call a tool, get parsed JSON (throws on tool errors)
//   await __T('capture_preview', {...});  // raw MCP result (for image content blocks)
// After an HMR reload the page loses globals; restore with:
//   eval(localStorage.getItem('__claude_bridge')); await __setup();
// Native WebMCP clients don't need this file.
(() => {
  const source = `
window.__setup = async () => {
  if (!document.modelContext) throw new Error('document.modelContext is missing: enable chrome://flags/#enable-webmcp-testing');
  const tools = await document.modelContext.getTools();
  window.__tools = Object.fromEntries(tools.map(t => [t.name, t]));
  // executeTool takes the registered tool object and a plain args object.
  window.__T = async (name, args = {}) => {
    const tool = __tools[name];
    if (!tool) throw new Error('Unknown tool ' + name + '. Known: ' + Object.keys(__tools).join(', '));
    const r = await document.modelContext.executeTool(tool, args);
    return typeof r === 'string' ? JSON.parse(r) : r;
  };
  window.__J = async (name, args = {}) => {
    const r = await __T(name, args);
    const text = r.content?.find(c => c.type === 'text')?.text;
    if (r.isError) throw new Error(name + ': ' + text);
    try { return JSON.parse(text); } catch { return text; }
  };
  // Shows a tool image result on top of the page so a screenshot can read it; __hide() removes it.
  window.__show = async (name, args) => {
    const r = await __T(name, args);
    const img = r.content.find(c => c.type === 'image');
    if (!img) throw new Error('No image in ' + name + ' result');
    let el = document.getElementById('__claude_view');
    if (!el) { el = document.createElement('img'); el.id = '__claude_view'; document.body.appendChild(el); }
    el.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#fff;max-height:100vh';
    el.src = 'data:' + img.mimeType + ';base64,' + img.data;
    await el.decode();
    return [el.naturalWidth, el.naturalHeight, r.content.filter(c => c.type === 'text').map(c => c.text).join(' ')];
  };
  window.__hide = () => document.getElementById('__claude_view')?.remove();
  // Keep raw polygons across reloads so phases can be rebuilt instead of patched.
  window.__save = (key, value) => localStorage.setItem('__claude_' + key, JSON.stringify(value));
  window.__load = key => JSON.parse(localStorage.getItem('__claude_' + key) ?? 'null');
  return Object.keys(__tools).length;
};`;
  localStorage.setItem('__claude_bridge', source);
  (0, eval)(source);
})();
