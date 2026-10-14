-- Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
-- Capture native Divs before Quarto constructs its theorem/proof nodes.
local function fail(message)
  assert(false, 'accessible-maths: ' .. message)
end

-- Locations are traversal ordinals, never authored identifiers or source lines.
local diagnostic_locations = {}
local function location(id)
  local ordinal = diagnostic_locations[id]
  return ordinal and ('element occurrence ' .. ordinal) or 'author annotation'
end

local function escape(value)
  return value:gsub('&', '&amp;'):gsub('<', '&lt;'):gsub('>', '&gt;')
    :gsub('"', '&quot;'):gsub("'", '&#39;')
end

local function named(value)
  return value and value:match('^[A-Za-z][A-Za-z0-9_-]*$') and #value <= 64
end

local function uri(value)
  return value and value:match('^[A-Za-z][A-Za-z0-9+.-]*:[^%s<>"{}]+$') and #value <= 2048
end

local function label(value, field, limit)
  -- Work in code points: locale-dependent byte patterns can corrupt UTF-8.
  -- Unicode White_Space, UCD 18.0.0 PropList; no external runtime dependency.
  local parts, pending_space, visible = {}, false, false
  for _, code in utf8.codes(value) do
    local space = (code >= 0x09 and code <= 0x0D) or code == 0x20 or code == 0x85
      or code == 0xA0 or code == 0x1680 or (code >= 0x2000 and code <= 0x200A)
      or code == 0x2028 or code == 0x2029 or code == 0x202F or code == 0x205F or code == 0x3000
    if space then
      pending_space = #parts > 0
    else
      if code < 0x20 or (code >= 0x7F and code <= 0x9F) then fail(field .. ' must not contain control characters') end
      if pending_space then parts[#parts + 1] = ' ' end
      parts[#parts + 1], pending_space = utf8.char(code), false
      local formatting = code == 0xAD or code == 0x61C or (code >= 0x200B and code <= 0x200F)
        or (code >= 0x202A and code <= 0x202E) or code == 0x2060
        or (code >= 0x2066 and code <= 0x2069) or code == 0xFEFF
      visible = visible or not formatting
    end
  end
  local text = table.concat(parts)
  if not visible or #text > (limit or 256) then
    fail(field .. ' must be nonblank text of at most ' .. (limit or 256) .. ' bytes')
  end
  return text
end

local function fragment(id)
  return '#' .. id:gsub('([^A-Za-z0-9._~-])', function(char) return string.format('%%%02X', char:byte()) end)
end

local function enabled_config(meta)
  local config = { enabled = true, ['theorem-controls'] = true, semantics = 'off', ['mathml-output']='internal',
    labels = { proof='Proof', hint='Hint', assumptions='Assumptions',
      related='Explore this statement', back='Back to statement', level='Explanation level', all='All explanations' } }
  local input = meta['accessible-maths']
  if not input then return config end
  if pandoc.utils.type(input) ~= 'table' and pandoc.utils.type(input) ~= 'MetaMap' then
    fail('accessible-maths options must be a mapping')
  end
  for key, value in pairs(input) do
    if config[key] == nil then fail('unknown accessible-maths option; use the documented option names') end
    if key == 'labels' then
      if pandoc.utils.type(value) ~= 'table' and pandoc.utils.type(value) ~= 'MetaMap' then fail('labels must be a mapping') end
      for name, text in pairs(value) do
        if not config.labels[name] then fail('unknown labels option; use the documented generated-label names') end
        local kind = pandoc.utils.type(text)
        if kind ~= 'Inlines' and kind ~= 'string' and kind ~= 'MetaString' and kind ~= 'MetaInlines' then
          fail('labels.' .. name .. ' must be text')
        end
        config.labels[name] = label(pandoc.utils.stringify(text), 'labels.' .. name)
      end
    elseif key == 'mathml-output' then
      local mode = pandoc.utils.stringify(value)
      if mode ~= 'internal' and mode ~= 'assistive' then fail('mathml-output must be internal or assistive') end
      config[key] = mode
    elseif key == 'semantics' then
      local mode = pandoc.utils.stringify(value)
      if mode ~= 'off' and mode ~= 'author-annotated' then fail('semantics must be off or author-annotated') end
      config[key] = mode
    else
      if type(value) ~= 'boolean' then fail(key .. ' must be a boolean') end
      config[key] = value
    end
  end
  if config.enabled and config['mathml-output'] == 'assistive' and config.semantics ~= 'author-annotated' then
    fail('mathml-output: assistive requires semantics: author-annotated')
  end
  return config
end

local theorem_prefixes = { thm=true, lem=true, cor=true, prp=true, cnj=true,
  def=true, exm=true, exr=true }
local function canonical(el)
  local prefix = el.identifier:match('^([a-z]+)%-')
  return theorem_prefixes[prefix] or prefix == 'prf' or prefix == 'rem' or prefix == 'sol'
    or el.classes:includes('proof') or el.classes:includes('remark') or el.classes:includes('solution')
end
local author_attributes = { ['am-summary']=true, ['am-level']=true, ['am-macro']=true,
  ['am-args']=true, ['am-intent']=true, ['am-tex']=true }

-- Only required brace-delimited arguments are supported. Escaped braces do not
-- change the nesting level. Code spans/blocks are never passed to this parser.
local function verbatim_end(text, last)
  local delimiter_position = last + 1
  if text:sub(delimiter_position, delimiter_position) == '*' then delimiter_position = delimiter_position + 1 end
  local delimiter = text:sub(delimiter_position, delimiter_position)
  if delimiter == '' or delimiter:match('%s') then fail('\\verb requires a non-space delimiter') end
  local ending = text:find(delimiter, delimiter_position + 1, true)
  local newline = text:find('\n', delimiter_position + 1, true)
  if not ending or (newline and newline < ending) then fail('unterminated \\verb literal') end
  return ending
end

local function argument(text, position, command)
  while text:sub(position, position):match('%s') do position = position + 1 end
  if text:sub(position, position) ~= '{' then fail('semantic macro requires brace-delimited arguments') end
  local start, depth = position + 1, 1
  position = position + 1
  while position <= #text do
    local char = text:sub(position, position)
    if char == '\\' then
      local first, last, control = text:find('\\([A-Za-z]+)', position)
      if first == position and control == 'verb' then position = verbatim_end(text, last) + 1
      else position = position + 2 end
    elseif char == '%' then position = (text:find('\n', position, true) or #text) + 1
    else
      if char == '{' then depth = depth + 1 end
      if char == '}' then depth = depth - 1 end
      if depth == 0 then return text:sub(start, position - 1), position + 1 end
      position = position + 1
    end
  end
  fail('unterminated semantic macro argument; close every required brace-delimited argument')
end

-- Compile the intentionally small visual-template language once. A control
-- symbol such as \# is literal; comments/verbatim/command definitions cannot
-- hide required arguments. This is authoring validation, not TeX sanitization.
local forbidden_template_commands = {}
for _, command in ipairs({'def','gdef','edef','xdef','let','futurelet','newcommand','renewcommand',
  'providecommand','DeclareRobustCommand','DeclareMathOperator','newenvironment','renewenvironment',
  'NewDocumentCommand','RenewDocumentCommand','ProvideDocumentCommand','DeclareDocumentCommand',
  'NewExpandableDocumentCommand','RenewExpandableDocumentCommand','ProvideExpandableDocumentCommand',
  'DeclareExpandableDocumentCommand','csname','endcsname','catcode','global','long','outer',
  'chardef','mathchardef','countdef','dimendef','skipdef','muskipdef','toksdef','font',
  'newif','newcount','newdimen','newskip','newmuskip','newtoks','newfont'}) do
  forbidden_template_commands[command] = true
end
local function compile_template(template, arity, id)
  local parts, literals, commands, placeholders = {}, {}, {}, {}
  local position, depth = 1, 0
  local function flush()
    if #literals > 0 then parts[#parts + 1] = table.concat(literals); literals = {} end
  end
  while position <= #template do
    local char = template:sub(position, position)
    if char == '%' then fail(location(id) .. ': am-tex must not contain comments; use \\% for a literal percent')
    elseif char == '\\' then
      local first, last, command = template:find('\\([A-Za-z]+)', position)
      if first == position then
        if command == 'verb' or forbidden_template_commands[command] then
          fail(location(id) .. ': am-tex does not support verbatim, command definitions or TeX indirection (\\' .. command .. ')')
        end
        commands[command] = true
        literals[#literals + 1], position = template:sub(first, last), last + 1
      else
        if position == #template then fail(location(id) .. ': am-tex ends in an incomplete control symbol') end
        literals[#literals + 1], position = template:sub(position, position + 1), position + 2
      end
    elseif char == '#' then
      local number = template:match('^#(%d+)', position)
      if not number or #number ~= 1 then fail(location(id) .. ': am-tex placeholders must be single-digit #1 to #4') end
      local index = tonumber(number)
      if index < 1 or index > arity then fail(location(id) .. ': am-tex has an undeclared argument') end
      placeholders[index] = (placeholders[index] or 0) + 1
      flush(); parts[#parts + 1] = index; position = position + 2
    else
      if char == '{' then depth = depth + 1 elseif char == '}' then depth = depth - 1 end
      if depth < 0 then fail(location(id) .. ': am-tex has unbalanced braces') end
      literals[#literals + 1], position = char, position + 1
    end
  end
  if depth ~= 0 then fail(location(id) .. ': am-tex has unbalanced braces') end
  for index = 1, arity do
    if placeholders[index] ~= 1 then fail(location(id) .. ': each am-tex #n placeholder must occur exactly once') end
  end
  flush()
  return parts, commands
end

local function declare(el, registry)
  local attrs, id = el.attributes, el.identifier
  if not attrs['am-macro'] then
    for _, key in ipairs({'am-args', 'am-intent', 'am-tex'}) do
      if attrs[key] then fail(location(id) .. ': ' .. key .. ' requires am-macro') end
    end
    return
  end
  if not id:match('^def%-') then fail('am-macro must be on a native #def- definition') end
  local command = attrs['am-macro']
  if not command:match('^am[A-Z][A-Za-z]*$') or #command > 64 or command == 'amIntent' or command == 'amArg' then
    fail(location(id) .. ': am-macro must start am followed by an uppercase ASCII letter; omit the backslash; amIntent/amArg are reserved')
  end
  if registry[command] then fail(location(id) .. ': duplicate am-macro declaration; use one definition per macro') end
  if not uri(attrs['semantic-id']) then fail(location(id) .. ': macro definition requires an absolute semantic-id URI') end
  local roles, seen = {}, {}
  for role in (attrs['am-args'] or ''):gmatch('%S+') do
    if not named(role) or seen[role] then fail(location(id) .. ': am-args requires unique ASCII role names') end
    roles[#roles + 1], seen[role] = role, true
  end
  if #roles < 1 or #roles > 4 then fail(location(id) .. ': declare one to four required arguments') end
  local intent = attrs['am-intent'] or ''
  local operator, arguments = intent:match('^([A-Za-z][A-Za-z0-9_-]*)%((.*)%)$')
  if not named(operator) then fail(location(id) .. ': am-intent requires operator($role,...) syntax') end
  local referenced, count = {}, 0
  for part in (arguments .. ','):gmatch('(.-),') do
    local role = part:match('^%s*%$([A-Za-z][A-Za-z0-9_-]*)%s*$')
    if not role or not seen[role] or referenced[role] then fail(location(id) .. ': am-intent must reference each declared role exactly once') end
    referenced[role], count = true, count + 1
  end
  if count ~= #roles then fail(location(id) .. ': am-intent has missing argument roles') end
  local template = attrs['am-tex'] or ''
  if #template == 0 or #template > 4096 then fail(location(id) .. ': am-tex requires a non-empty bounded TeX template') end
  local parts, commands = compile_template(template, #roles, id)
  registry[command] = { roles=roles, intent=intent, template=template, source=id,
    semanticId=attrs['semantic-id'], parts=parts, commands=commands }
end

local function expand(text, registry, annotated, depth)
  if #text > 65536 or depth > 16 then fail('semantic macro expansion exceeds its size or nesting limit') end
  local result, position, size = {}, 1, 0
  while position <= #text do
    do
    local char = text:sub(position, position)
    if char == '%' then
      local ending = text:find('\n', position, true) or #text
      result[#result + 1], position = text:sub(position, ending), ending + 1
      goto continue
    elseif char ~= '\\' then
      -- Copy ordinary TeX in runs. Only backslashes and comments can alter
      -- lexical treatment here; keep their existing validation paths intact.
      local ending = text:find('[\\%%]', position) or (#text + 1)
      result[#result + 1], position = text:sub(position, ending - 1), ending
      goto continue
    end
    local first, last, command = text:find('\\([A-Za-z]+)', position)
    if first ~= position then
      result[#result + 1], position = text:sub(position, position + 1), position + 2
      goto continue
    end
    if command == 'verb' then
      local ending = verbatim_end(text, last)
      result[#result + 1], position = text:sub(position, ending), ending + 1
      goto continue
    end
    local declaration = registry[command]
    if command == 'amIntent' or command == 'amArg' then fail('amIntent/amArg are internal helpers; declare an am-macro on a definition') end
    if declaration then
      local values, next_position = {}, last + 1
      for index, role in ipairs(declaration.roles) do
        local value
        value, next_position = argument(text, next_position, command)
        value = expand(value, registry, annotated, depth + 1)
        values[index] = annotated and ('\\amArg{' .. role .. '}{' .. value .. '}') or ('{' .. value .. '}')
      end
      local replacement_parts = {}
      for _, part in ipairs(declaration.parts) do
        replacement_parts[#replacement_parts + 1] = type(part) == 'number' and values[part] or part
      end
      local replacement = table.concat(replacement_parts)
      if annotated then replacement = '\\amIntent{' .. declaration.intent .. '}{' .. replacement .. '}' end
      result[#result + 1], position = replacement, next_position
      size = size + #replacement
      if size > 65536 then fail('semantic macro expansion exceeds its size limit') end
    else
      result[#result + 1], position = text:sub(first, last), last + 1
    end
    end
    ::continue::
  end
  local output = table.concat(result)
  if #output > 65536 then fail('expanded expression exceeds 65536 bytes') end
  return output
end

local function process(doc)
  diagnostic_locations = {}
  local config = enabled_config(doc.meta)
  if not config.enabled then return doc end
  local html = FORMAT == 'html' or FORMAT == 'html5'
  if html and config.semantics == 'author-annotated' then
    local method = PANDOC_WRITER_OPTIONS.html_math_method
    if not method or method.method ~= 'mathjax'
      or method.url ~= 'https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-mml-chtml.js' then
      fail('author-annotated HTML requires native html-math-method: {method: mathjax, url: https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-mml-chtml.js}; pin the single native loader')
    end
  end
  local ids, semantic_ids, targets, registry, disclosures, related, declarations, summaries = {}, {}, {}, {}, {}, {}, {}, {}
  local ordinal = 0
  local function collect(el)
    ordinal = ordinal + 1
    local id = el.identifier
    diagnostic_locations[id] = ordinal
    if id ~= '' then
      if ids[id] then fail(location(id) .. ': duplicate rendered identifier; give each authored element a distinct identifier') end
      ids[id] = true
    end
    for key in pairs(el.attributes) do
      if key:match('^am%-') and not author_attributes[key] then fail(location(id) .. ': unknown am- attribute; use the documented annotation names') end
      if key:match('^am%-') and el.t ~= 'Div' then fail(location(id) .. ': ' .. key .. ' requires a definition or associated disclosure Div') end
      if (key == 'proof-for' or key == 'theorem-for') and el.t ~= 'Div' then
        fail(location(id) .. ': ' .. key .. ' requires an associated disclosure Div')
      end
    end
    local semantic = el.attributes['semantic-id']
    if semantic then
      if not uri(semantic) then fail(location(id) .. ': semantic-id must be an absolute URI') end
      if semantic_ids[semantic] then fail(location(id) .. ': duplicate semantic-id; give each meaning a distinct URI in this document') end
      semantic_ids[semantic] = id
    end
  end
  doc.blocks:walk({ Div=function(el)
    collect(el)
    local prefix = el.identifier:match('^([a-z]+)%-')
    if theorem_prefixes[prefix] then targets[el.identifier] = true end
    if theorem_prefixes[prefix] and el.attributes['semantic-id'] then
      declarations[#declarations + 1] = { id=el.attributes['semantic-id'], anchor=el.identifier,
        type=prefix, label=el.attributes.name or el.identifier }
    end
    local explanation = el.classes:includes('am-explanation')
    local protected = canonical(el)
      or el.classes:includes('am-hint') or el.classes:includes('am-assumption')
    if explanation or protected then
      el.content:walk({ Div=function(child)
        if child.classes:includes('am-explanation') or (explanation and (canonical(child)
          or child.classes:includes('am-hint') or child.classes:includes('am-assumption'))) then
          fail(location(el.identifier) .. ': explanations must be outside theorem/proof/hint/assumption blocks and cannot contain them or other explanations')
        end
      end })
    end
    declare(el, registry)
  end, Header=collect, Span=collect, Code=collect, CodeBlock=collect,
    Link=collect, Image=collect, Table=collect, Figure=collect })
  for _, declaration in pairs(registry) do
    for command in pairs(declaration.commands) do
      if registry[command] or command == 'amIntent' or command == 'amArg'
        then
        fail(location(declaration.source) .. ': am-tex must contain ordinary visual TeX, without page-local macros or macro definitions')
      end
    end
  end
  local function target(value, id)
    local resolved = value:sub(1, 1) == '#' and value:sub(2) or semantic_ids[value]
    if not resolved or not targets[resolved] then fail(location(id) .. ': unresolved theorem target; use an existing statement fragment or semantic-id on this page') end
    return resolved
  end
  doc.blocks:walk({ traverse='topdown', Div=function(el)
    local attrs, id = el.attributes, el.identifier
    local native_proof = el.classes:includes('proof')
    local proof = native_proof and attrs['proof-for'] ~= nil
    local hint, assumption = el.classes:includes('am-hint'), el.classes:includes('am-assumption')
    local explanation = el.classes:includes('am-explanation')
    local kinds = (native_proof and 1 or 0) + (hint and 1 or 0) + (assumption and 1 or 0) + (explanation and 1 or 0)
    if kinds > 1 then fail(location(id) .. ': choose one disclosure kind') end
    if (hint or assumption or explanation) and canonical(el) then
      fail(location(id) .. ': explanation/hint/assumption identifiers and classes must not create a native theorem/proof/remark/solution')
    end
    if attrs['proof-for'] and not native_proof then fail(location(id) .. ': proof-for requires a native .proof') end
    if attrs['am-level'] and not explanation then fail(location(id) .. ': am-level requires an am-explanation') end
    if not proof and not hint and not assumption and not explanation then
      if attrs['am-summary'] then fail(location(id) .. ': am-summary requires an associated proof, hint, assumption or explanation') end
      if attrs['proof-for'] then fail(location(id) .. ': proof-for requires a native .proof') end
      if attrs['theorem-for'] then fail(location(id) .. ': theorem-for requires an am-hint, am-assumption or am-explanation') end
      return
    end
    if id == '' then fail('associated disclosures require an explicit identifier') end
    if proof and not id:match('^prf%-') then fail('native proof identifiers must begin prf-') end
    if proof and attrs['theorem-for'] then fail(location(id) .. ': use proof-for alone for a native proof') end
    local association = proof and attrs['proof-for'] or attrs['theorem-for']
    if not association then fail(location(id) .. ': hints/assumptions/explanations require theorem-for') end
    local resolved = target(association, id)
    if explanation and not attrs['am-summary'] then fail(location(id) .. ': am-explanation requires an authored am-summary') end
    local kind = proof and 'proof' or (hint and 'hint' or (assumption and 'assumptions' or 'explanation'))
    local summary = label(attrs['am-summary'] or config.labels[kind], location(id) .. ': am-summary')
    local level = attrs['am-level'] and label(attrs['am-level'], location(id) .. ': am-level', 64) or nil
    local disclosure_id = 'am-disclosure-' .. id
    if ids[disclosure_id] then fail(location(id) .. ': generated disclosure identifier conflicts with authored content; rename the authored identifier') end
    ids[disclosure_id] = true
    disclosures[id] = { id=disclosure_id, source=id, summary=summary, target=resolved, kind=kind, level=level }
    related[resolved] = related[resolved] or {}
    summaries[resolved] = summaries[resolved] or {}
    if summaries[resolved][summary] then fail(location(id) .. ': duplicate am-summary for this statement; give each related block a distinct authored label') end
    summaries[resolved][summary] = true
    related[resolved][#related[resolved] + 1] = disclosures[id]
  end })
  local math_count, has_registry = 0, next(registry) ~= nil
  local annotated = html and config.semantics == 'author-annotated'
  local rewrite = {}
  if has_registry or annotated then rewrite.Math = function(el)
    math_count = math_count + 1
    if has_registry then
      el.text = expand(el.text, registry, annotated, 0)
    end
    return el
  end end
  if next(disclosures) then rewrite.Div = function(el)
    local record = disclosures[el.identifier]
    if html and config['theorem-controls'] and record then
      el.attributes['am-disclosure'] = record.id
      el.attributes['am-theorem'] = record.target
      el.attributes['am-kind'] = record.kind
      if record.level then el.attributes['am-level'] = record.level end
      el.content:insert(1, pandoc.RawBlock('html', '<details id="' .. escape(record.id)
        .. '" class="am-disclosure"><summary>' .. escape(record.summary) .. '</summary><div class="am-disclosure-body">'))
      el.content:insert(pandoc.Para({pandoc.Link({pandoc.Str(config.labels.back)}, fragment(record.target), '',
        pandoc.Attr('', {'am-return'}, {['am-return']='true'}))}))
      el.content:insert(pandoc.RawBlock('html', '</div></details>'))
    elseif record then
      el.content:insert(1, pandoc.Para({pandoc.Strong({pandoc.Str(record.summary)})}))
      el.content:insert(pandoc.Para({pandoc.Link({pandoc.Str(config.labels.back)}, fragment(record.target), '',
        pandoc.Attr('', {'am-return'}, {['am-return']='true'}))}))
    end
    if html and config['theorem-controls'] and related[el.identifier] then
      el.attributes['am-theorem-target'] = 'true'
      local links, has_level = {}, false
      for _, item in ipairs(related[el.identifier]) do
        links[#links + 1] = '<li><a href="' .. escape(fragment(item.source)) .. '">' .. escape(item.summary) .. '</a></li>'
        has_level = has_level or item.level ~= nil
      end
      el.content:insert(pandoc.RawBlock('html', '<div class="am-related" role="group" aria-label="'
        .. escape(config.labels.related) .. '"><p>' .. escape(config.labels.related) .. '</p><ul>' .. table.concat(links) .. '</ul></div>'))
      if has_level then
        el.content:insert(pandoc.RawBlock('html', '<div class="am-level-controls" hidden data-am-level-for="'
          .. escape(el.identifier) .. '" data-am-level-label="' .. escape(config.labels.level)
          .. '" data-am-all-label="' .. escape(config.labels.all) .. '"></div>'))
      end
    end
    return el
  end end
  -- Ordinary pages still receive full authoring/identity validation above, but
  -- need no final transforming AST walk when neither feature is used.
  if next(rewrite) then doc.blocks = doc.blocks:walk(rewrite) end
  if html and config['theorem-controls'] and next(disclosures) then
    quarto.doc.add_html_dependency({ name='accessible-maths-controls', version='0.0.4',
      scripts={'theorem-controls.js'}, stylesheets={'theorem-controls.css'} })
  end
  if html and config.semantics == 'author-annotated' and math_count > 0 then
    quarto.doc.add_html_dependency({ name='accessible-maths-semantics', version='0.0.4',
      scripts={{path='mathjax-adapter.js', attribs={['data-am-mathml-output']=config['mathml-output']}}} })
  end
  -- Page-local interoperability data is inert, explicit and independent of the
  -- renderer. This is a declarations slice of shared v0, not a KG snapshot or
  -- an inference about expressions, mathematical truth or included-file spans.
  if html and #declarations > 0 then
    if ids['accessible-maths-declarations'] then fail('reserved declaration payload identifier #accessible-maths-declarations conflicts with authored content') end
    local input = quarto.doc.input_file
    local root = quarto.project.directory or pandoc.path.directory(input)
    local source = pandoc.path.make_relative(input, root):gsub('\\', '/')
    if source:match('^%.%./') or source:match('^/') or source:match('^%a:') then
      fail('declaration source must be within the containing project/document directory')
    end
    local language = doc.meta.lang and pandoc.utils.stringify(doc.meta.lang) or 'und'
    local objects, occurrences, notation_by_id = {}, {}, {}
    for command, notation in pairs(registry) do
      notation_by_id[notation.semanticId] = {command=command, roles=notation.roles, intent=notation.intent, visualTeX=notation.template}
    end
    table.sort(declarations, function(a, b) return a.id < b.id end)
    for _, declaration in ipairs(declarations) do
      local location = {document=source, anchor=declaration.anchor, precision='anchor'}
      local object = {id=declaration.id, type=declaration.type,
        labels={{language=language, text=declaration.label}}, origin='author-declared',
        reviewStatus='not-asserted', source=location,
        publication={decision='rendered-source', licence='not-asserted'}}
      object.notation = notation_by_id[declaration.id]
      objects[#objects + 1] = object
      occurrences[#occurrences + 1] = {id=declaration.anchor, target=declaration.id, source=location,
        destination=fragment(declaration.anchor)}
    end
    local payload = {schemaVersion=1, contractVersion='0', kind='accessible-maths-declarations',
      producer={name='accessible-maths', version='0.0.5'},
      scope={type='document', source=source, occurrenceIds='document-local'},
      coverage='explicit-native-declarations-only', objects=objects, occurrences=occurrences}
    local json = quarto.json.encode(payload):gsub('<', '\\u003c'):gsub('>', '\\u003e'):gsub('&', '\\u0026')
      :gsub(utf8.char(0x2028), '\\u2028'):gsub(utf8.char(0x2029), '\\u2029')
    quarto.doc.include_text('after-body', '<script type="application/json" id="accessible-maths-declarations">' .. json .. '</script>')
  end
  return doc
end

return { Pandoc=process }
