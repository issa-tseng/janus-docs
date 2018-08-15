const { DomView, attribute } = require('janus');
const $ = require('janus-dollar');

require('codemirror/addon/edit/closebrackets');
require('codemirror/addon/edit/matchbrackets');
require('codemirror/addon/edit/trailingspace');
require('codemirror/mode/xml/xml');
require('codemirror/mode/javascript/javascript');
const CodeMirror = require('codemirror');

class EditorView extends DomView {
  _render() {
    const wrapper = $('<div class="code-editor"/>');
    this._cm = new CodeMirror((inner) => {
      wrapper.append(inner);
      setTimeout(() => { this._cm.refresh(); }, 0);
    }, {
      autoCloseBrackets: true,
      extraKeys: {
        Enter: (cm) => {
          const fallthrough = () => { cm.execCommand('newlineAndIndent'); };

          // immediate aborts:
          if ((cm.doc.getCursor().line + 1) < cm.doc.lineCount()) return fallthrough();
          if (cm.doc.getSelection().length > 0) return fallthrough();

          // bailout cases (do nothing):
          if (typeof this.options.onCommit === 'function')
            if (this.options.onCommit() === true)
              return;

          // default behaviour:
          fallthrough();
        }
      },
      matchBrackets: true,
      mode: this.options.language || 'javascript',
      showTrailingSpace: true,
      value: this.subject.getValue() || '',
      viewportMargin: Infinity
    });

    this.subject.watchValue().react(false, (value) => {
      if (this._lock !== true) this._cm.setValue(value);
    });

    return wrapper;
  }

  _wireEvents() {
    this._cm.on('change', (cm) => {
      this._lock = true;
      this.subject.setValue(cm.getValue());
      this._lock = false;
    });
  }

  setCursor(line, col) {
    this._cm.focus();
    this._cm.setCursor(line - 1, col - 1);
  }

  focus() {
    this._cm.focus();
  };
}

module.exports = {
  EditorView,
  registerWith: (library) => library.register(attribute.Text, EditorView, { context: 'edit', style: 'code' })
};

