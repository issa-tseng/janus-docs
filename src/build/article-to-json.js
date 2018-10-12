const { readFileSync, writeFileSync } = require('fs');

const md = require('marked');
const $ = require('janus-dollar');

const [ , , infile, outfile ] = process.argv;

const article = { samples: [] };

// util.
const last = (xs) => xs[xs.length - 1];

const reanchor = (header) => {
  const anchor = $('<a/>').attr('id', header.attr('id'));
  header.attr('id', null);
  header.prepend(anchor);
};


////////////////////////////////////////////////////////////////////////////////
// BEGIN PROCESSING

// convert markdown to html and feed it to jsdom/jquery for postprocessing.
const converted = md(readFileSync(infile, 'utf8'));
const dom = $(`<div class="article">${converted}</div>`);
const levelTypes = { '@': 'class', '::': 'class', '#': 'instance', '.': 'instance' };
const typeTypes = { '@': 'method', '#': 'method', '::': 'property', '.': 'property' };

// separate paths for apirefs, articles.
const isApiRef = infile.includes('docs/api/');
if (isApiRef === true) {
  // API REFERENCE
  // set some things up for api mode.
  dom.addClass('apiref');
  article.exports = [];
  const apiPath = '/api/' + /docs\/api\/([a-z]+).md$/.exec(infile)[1];

  // run linearly through the document and build an API model.
  let ptr = dom.children(':first');
  let obj, section, member;
  do {
    if (ptr.is('h1')) {
      obj = { name: ptr.text(), path: apiPath, sections: [], members: [] };
      article.exports.push(obj);
      reanchor(ptr);
    } else if (ptr.is('h2')) {
      const name = ptr.text();
      section = { name, members: [] };
      obj.sections.push(section);
      reanchor(ptr);
    } else if (ptr.is('h3')) {
      const rawname = ptr.text();
      const nameparts = /^(.+) !AS (.+)$/.exec(rawname);
      const name = (nameparts == null) ? rawname : nameparts[1];
      const ref = (nameparts == null) ? rawname : nameparts[2];

      const level = levelTypes[name[0]];
      const type = typeTypes[name[0]];
      member = { name, ref, level, type, invocations: [] };
      obj.members.push(member);
      section.members.push(ref);

      ptr.addClass('level-' + level);
      ptr.addClass('type-' + type);

      // fixup the on-page name and id.
      ptr.text(name);
      ptr.prop('id', (level === 'class') ? ref : ref.slice(1));
      reanchor(ptr);
    } else if (ptr.is('h4')) {
      const invocation = ptr.text()
        .replace(/=>/g, '⇒')
        .replace(/->/g, '→');
      ptr.text(invocation);
      member.invocations.push(invocation);

      // TODO: what if different invocations have different types? doesn't exist yet though.
      if (member.return_type == null) {
        const returnType = /: ([^:]+)$/.exec(invocation);
        if (returnType != null) member.return_type = returnType[1];
      }

      ptr.prop('id', '');
    } else if (ptr.is('ul')) {
      const children = ptr.children();
      children.each((_, child) => {
        const text = $(child).text();
        if (text.startsWith('!')) {
          if (text.startsWith('!VARIANT')) {
            // for now do nothing; not sure how to model this.
          } else if (text.startsWith('!IMPURE')) {
            member.impure = true;
          } else if (text.startsWith('!CURRIES')) {
            member.curries = true;
          }
          $(child).remove();
        }
      });
      if (ptr.children().length === 0) {
        const reap = ptr;
        ptr = ptr.prev();
        reap.remove();
      }
    }
  } while ((ptr = ptr.next()).length > 0);
} else {
  // ARTICLE
  // move around some of the markup.
  dom.find('h1, h2').each((_, h) => { reanchor($(h)); });
}

// extract code samples as long as they exist in the document.
while ((first = dom.children('pre:first')).length > 0) {
  // grab all contiguous <pre>s.
  const pres = [ first ];
  while ((next = last(pres).next()).is('pre'))
    pres.push(next);

  // convert samples to model data; save.
  const id = article.samples.length;
  const sample = { id };
  for (const pre of pres) {
    const code = pre.children('code');
    const [ , subtype ] = /^$|^language-(.*)$/.exec(code.prop('class'));

    if (isApiRef === true)
      sample.inspect = true;

    if (subtype === 'noexec') {
      sample.noexec = true;
      sample.main = code.text();
    } else if (subtype === 'manual-require') {
      sample['manual-require'] = true;
      sample.main = code.text();
    } else if (subtype === 'html') {
      sample.noexec = true;
      sample.language = 'xml';
      sample.main = code.text();
    } else {
      sample[subtype || 'main'] = code.text();
    }
  }

  // remove found elements, replace with marker.
  pres.shift().replaceWith(`<div id="sample-${id}"/>`);
  for (const pre of pres) pre.remove();

  // write our data.
  article.samples.push(sample);
}

// now export the article html as-is to the article data.
article.html = dom.get(0).outerHTML;

// write final file.
writeFileSync(outfile, JSON.stringify(article));

