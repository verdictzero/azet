// form-fields.js — Reusable form field factory functions

function el(tag, attrs = {}, children = []) {
  const elem = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') elem.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(elem.style, v);
    else if (k.startsWith('on')) elem.addEventListener(k.slice(2).toLowerCase(), v);
    else elem.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') elem.appendChild(document.createTextNode(c));
    else if (c) elem.appendChild(c);
  }
  return elem;
}

export function createDropdown(label, options, selected, onChange) {
  const wrap = el('div', { className: 'form-field' });
  if (label) wrap.appendChild(el('label', { className: 'form-label' }, [label]));

  const select = el('select', { className: 'form-input' });
  for (const opt of options) {
    const val = typeof opt === 'string' ? opt : opt.value;
    const lbl = typeof opt === 'string' ? opt : opt.label;
    const o = el('option', { value: val }, [lbl]);
    if (val === selected) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener('change', () => onChange(select.value));
  wrap.appendChild(select);
  return wrap;
}

export function createTextInput(label, value, onChange, opts = {}) {
  const wrap = el('div', { className: 'form-field' });
  if (label) wrap.appendChild(el('label', { className: 'form-label' }, [label]));

  const input = el('input', {
    type: 'text', className: 'form-input', value: value || '',
    placeholder: opts.placeholder || '',
  });
  if (opts.maxLength) input.maxLength = opts.maxLength;
  if (opts.readOnly) input.readOnly = true;
  input.addEventListener('input', () => onChange(input.value));
  wrap.appendChild(input);
  return wrap;
}

export function createNumberInput(label, value, onChange, opts = {}) {
  const wrap = el('div', { className: 'form-field' });
  if (label) wrap.appendChild(el('label', { className: 'form-label' }, [label]));

  const input = el('input', {
    type: 'number', className: 'form-input', value: String(value ?? 0),
  });
  if (opts.min !== undefined) input.min = opts.min;
  if (opts.max !== undefined) input.max = opts.max;
  if (opts.step !== undefined) input.step = opts.step;
  input.addEventListener('input', () => onChange(parseFloat(input.value) || 0));
  wrap.appendChild(input);
  return wrap;
}

export function createTextarea(label, value, onChange, opts = {}) {
  const wrap = el('div', { className: 'form-field' });
  if (label) wrap.appendChild(el('label', { className: 'form-label' }, [label]));

  const ta = el('textarea', {
    className: 'form-input', rows: opts.rows || 3,
    placeholder: opts.placeholder || '',
  });
  ta.value = value || '';
  ta.addEventListener('input', () => onChange(ta.value));
  wrap.appendChild(ta);
  return wrap;
}

export function createCheckbox(label, checked, onChange) {
  const wrap = el('div', { className: 'form-field form-field-inline' });
  const input = el('input', { type: 'checkbox' });
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.appendChild(input);
  wrap.appendChild(el('label', { className: 'form-label-inline' }, [label]));
  return wrap;
}

export function createColorPicker(label, value, onChange) {
  const wrap = el('div', { className: 'form-field' });
  if (label) wrap.appendChild(el('label', { className: 'form-label' }, [label]));

  const row = el('div', { className: 'form-row' });
  const input = el('input', { type: 'color', className: 'form-color', value: value || '#ffffff' });
  const hex = el('span', { className: 'color-hex' }, [value || '#ffffff']);
  input.addEventListener('input', () => {
    hex.textContent = input.value;
    onChange(input.value);
  });
  row.appendChild(input);
  row.appendChild(hex);
  wrap.appendChild(row);
  return wrap;
}

export function createCharInput(label, value, onChange) {
  const wrap = el('div', { className: 'form-field' });
  if (label) wrap.appendChild(el('label', { className: 'form-label' }, [label]));

  const row = el('div', { className: 'form-row' });
  const input = el('input', {
    type: 'text', className: 'form-input char-input', value: value || '',
    maxLength: '1', style: { width: '40px', textAlign: 'center' },
  });
  const preview = el('span', { className: 'char-preview' }, [value || ' ']);
  input.addEventListener('input', () => {
    const ch = input.value.slice(-1) || ' ';
    input.value = ch;
    preview.textContent = ch;
    onChange(ch);
  });
  row.appendChild(input);
  row.appendChild(preview);
  wrap.appendChild(row);
  return wrap;
}

export function createTagPicker(label, allTags, selectedTags, maxTags, onChange) {
  const wrap = el('div', { className: 'form-field' });
  if (label) wrap.appendChild(el('label', { className: 'form-label' }, [label]));

  const tags = [...(selectedTags || [])];
  const container = el('div', { className: 'tag-picker' });

  function render() {
    container.innerHTML = '';
    // Chips
    const chipRow = el('div', { className: 'tag-chips' });
    for (const tag of tags) {
      const chip = el('span', { className: 'tag-chip' }, [
        tag,
        el('button', { className: 'tag-chip-remove', onClick: () => {
          tags.splice(tags.indexOf(tag), 1);
          onChange([...tags]);
          render();
        }}, ['×']),
      ]);
      chipRow.appendChild(chip);
    }
    container.appendChild(chipRow);

    // Add dropdown
    if (!maxTags || tags.length < maxTags) {
      const available = allTags.filter(t => !tags.includes(t));
      if (available.length > 0) {
        const select = el('select', { className: 'form-input tag-select' });
        select.appendChild(el('option', { value: '' }, ['+ Add...']));
        for (const t of available) {
          select.appendChild(el('option', { value: t }, [t]));
        }
        select.addEventListener('change', () => {
          if (select.value) {
            tags.push(select.value);
            onChange([...tags]);
            render();
          }
        });
        container.appendChild(select);
      }
    }
  }

  render();
  wrap.appendChild(container);
  return wrap;
}

export function createKeyValueEditor(label, pairs, keyOptions, onChange) {
  const wrap = el('div', { className: 'form-field' });
  if (label) wrap.appendChild(el('label', { className: 'form-label' }, [label]));

  const data = { ...(pairs || {}) };
  const container = el('div', { className: 'kv-editor' });

  function render() {
    container.innerHTML = '';
    for (const [key, val] of Object.entries(data)) {
      const row = el('div', { className: 'kv-row' });

      if (keyOptions) {
        const sel = el('select', { className: 'form-input kv-key' });
        for (const k of keyOptions) {
          const o = el('option', { value: k }, [k]);
          if (k === key) o.selected = true;
          sel.appendChild(o);
        }
        sel.addEventListener('change', () => {
          const newKey = sel.value;
          if (newKey !== key) {
            delete data[key];
            data[newKey] = val;
            onChange({ ...data });
            render();
          }
        });
        row.appendChild(sel);
      } else {
        row.appendChild(el('span', { className: 'kv-key-label' }, [key]));
      }

      const numInput = el('input', {
        type: 'number', className: 'form-input kv-value', value: String(val),
      });
      numInput.addEventListener('input', () => {
        data[key] = parseFloat(numInput.value) || 0;
        onChange({ ...data });
      });
      row.appendChild(numInput);

      const removeBtn = el('button', { className: 'btn-small btn-remove', onClick: () => {
        delete data[key];
        onChange({ ...data });
        render();
      }}, ['×']);
      row.appendChild(removeBtn);
      container.appendChild(row);
    }

    // Add button
    const addBtn = el('button', { className: 'btn-small', onClick: () => {
      const availableKeys = keyOptions ? keyOptions.filter(k => !(k in data)) : ['key'];
      const newKey = availableKeys[0] || 'new_key';
      data[newKey] = 0;
      onChange({ ...data });
      render();
    }}, ['+ Add']);
    container.appendChild(addBtn);
  }

  render();
  wrap.appendChild(container);
  return wrap;
}

export function createStatBlock(label, stats, statKeys, onChange) {
  const wrap = el('div', { className: 'form-field' });
  if (label) wrap.appendChild(el('label', { className: 'form-label' }, [label]));

  const grid = el('div', { className: 'stat-block' });
  const data = { ...(stats || {}) };

  for (const key of statKeys) {
    const item = el('div', { className: 'stat-item' });
    item.appendChild(el('label', { className: 'stat-label' }, [key]));
    const input = el('input', {
      type: 'number', className: 'form-input stat-input',
      value: String(data[key] ?? 0),
    });
    input.addEventListener('input', () => {
      data[key] = parseFloat(input.value) || 0;
      onChange({ ...data });
    });
    item.appendChild(input);
    grid.appendChild(item);
  }

  wrap.appendChild(grid);
  return wrap;
}

export function createListEditor(label, items, onAdd, onRemove, onUpdate, renderItem) {
  const wrap = el('div', { className: 'form-field' });
  if (label) {
    const header = el('div', { className: 'list-header' });
    header.appendChild(el('label', { className: 'form-label' }, [label]));
    header.appendChild(el('button', { className: 'btn-small', onClick: () => {
      onAdd();
      rebuild();
    }}, ['+ Add']));
    wrap.appendChild(header);
  }

  const container = el('div', { className: 'list-editor' });

  function rebuild() {
    container.innerHTML = '';
    const currentItems = typeof items === 'function' ? items() : items;
    for (let i = 0; i < currentItems.length; i++) {
      const row = el('div', { className: 'list-item' });
      const content = renderItem(currentItems[i], i, (patch) => {
        onUpdate(i, patch);
      });
      if (content) row.appendChild(content);
      row.appendChild(el('button', { className: 'btn-small btn-remove', onClick: () => {
        onRemove(i);
        rebuild();
      }}, ['×']));
      container.appendChild(row);
    }
  }

  rebuild();
  wrap.appendChild(container);
  wrap._rebuild = rebuild;
  return wrap;
}

export function createConditionBuilder(condition, onChange) {
  const wrap = el('div', { className: 'form-field condition-builder' });
  wrap.appendChild(el('label', { className: 'form-label' }, ['Conditions']));

  const data = { ...(condition || {}) };
  const container = el('div', { className: 'condition-rows' });

  const COND_TYPES = [
    { key: 'minRep', label: 'Min Reputation', type: 'number' },
    { key: 'maxRep', label: 'Max Reputation', type: 'number' },
    { key: 'questActive', label: 'Quest Active', type: 'text' },
    { key: 'questComplete', label: 'Quest Complete', type: 'text' },
    { key: 'hasFlag', label: 'Has Flag', type: 'text' },
    { key: 'hasItem', label: 'Has Item', type: 'text' },
  ];

  function render() {
    container.innerHTML = '';
    for (const ct of COND_TYPES) {
      if (data[ct.key] !== undefined && data[ct.key] !== null && data[ct.key] !== '') {
        const row = el('div', { className: 'condition-row' });
        row.appendChild(el('span', { className: 'condition-label' }, [ct.label]));

        const input = el('input', {
          type: ct.type, className: 'form-input',
          value: String(data[ct.key]),
        });
        input.addEventListener('input', () => {
          data[ct.key] = ct.type === 'number' ? (parseFloat(input.value) || 0) : input.value;
          onChange({ ...data });
        });
        row.appendChild(input);

        row.appendChild(el('button', { className: 'btn-small btn-remove', onClick: () => {
          delete data[ct.key];
          onChange(Object.keys(data).length > 0 ? { ...data } : null);
          render();
        }}, ['×']));
        container.appendChild(row);
      }
    }

    // Add condition dropdown
    const unused = COND_TYPES.filter(ct => data[ct.key] === undefined || data[ct.key] === null || data[ct.key] === '');
    if (unused.length > 0) {
      const select = el('select', { className: 'form-input' });
      select.appendChild(el('option', { value: '' }, ['+ Add condition...']));
      for (const ct of unused) {
        select.appendChild(el('option', { value: ct.key }, [ct.label]));
      }
      select.addEventListener('change', () => {
        if (select.value) {
          const ct = COND_TYPES.find(c => c.key === select.value);
          data[ct.key] = ct.type === 'number' ? 0 : '';
          onChange({ ...data });
          render();
        }
      });
      container.appendChild(select);
    }
  }

  render();
  wrap.appendChild(container);
  return wrap;
}

export function createConsequenceBuilder(consequence, onChange) {
  const wrap = el('div', { className: 'form-field consequence-builder' });
  wrap.appendChild(el('label', { className: 'form-label' }, ['Consequence']));

  const data = consequence ? { ...consequence } : null;
  const container = el('div', { className: 'consequence-rows' });

  const CONS_TYPES = [
    { value: 'set_flag', label: 'Set Flag', fields: ['flag', 'value'] },
    { value: 'change_rep', label: 'Change Reputation', fields: ['amount'] },
    { value: 'give_item', label: 'Give Item', fields: ['itemId'] },
    { value: 'start_quest', label: 'Start Quest', fields: ['questChainId'] },
    { value: 'action', label: 'Action (shop/heal/rest/teach)', fields: ['actionType'] },
  ];

  function render() {
    container.innerHTML = '';

    if (data && data.type) {
      const ct = CONS_TYPES.find(c => c.value === data.type);
      if (ct) {
        const typeLabel = el('div', { className: 'consequence-type' }, [ct.label]);
        container.appendChild(typeLabel);

        for (const field of ct.fields) {
          const row = el('div', { className: 'consequence-row' });
          row.appendChild(el('span', { className: 'consequence-field-label' }, [field]));
          const input = el('input', {
            type: field === 'amount' ? 'number' : 'text',
            className: 'form-input',
            value: String(data[field] || ''),
          });
          input.addEventListener('input', () => {
            data[field] = field === 'amount' ? (parseFloat(input.value) || 0) : input.value;
            onChange({ ...data });
          });
          row.appendChild(input);
          container.appendChild(row);
        }

        container.appendChild(el('button', { className: 'btn-small btn-remove', onClick: () => {
          onChange(null);
          render();
        }}, ['Remove consequence']));
      }
    } else {
      // Add consequence dropdown
      const select = el('select', { className: 'form-input' });
      select.appendChild(el('option', { value: '' }, ['+ Add consequence...']));
      for (const ct of CONS_TYPES) {
        select.appendChild(el('option', { value: ct.value }, [ct.label]));
      }
      select.addEventListener('change', () => {
        if (select.value) {
          const newData = { type: select.value };
          const ct = CONS_TYPES.find(c => c.value === select.value);
          for (const f of ct.fields) newData[f] = '';
          Object.assign(data || {}, newData);
          onChange(newData);
          render();
        }
      });
      container.appendChild(select);
    }
  }

  render();
  wrap.appendChild(container);
  return wrap;
}
