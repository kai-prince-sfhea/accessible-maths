-- Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
-- Capture native Divs before Quarto constructs its theorem/proof nodes.
local function fail(message)
  assert(false, 'accessible-maths: ' .. message)
end
local intent_grammar = dofile(pandoc.path.join({pandoc.path.directory(PANDOC_SCRIPT_FILE), 'intent-grammar.lua'}))
local catalogue_api = dofile(pandoc.path.join({pandoc.path.directory(PANDOC_SCRIPT_FILE), 'catalogue-api.lua'}))
local runtime_script=PANDOC_SCRIPT_FILE
if not pandoc.path.is_absolute(runtime_script) then runtime_script=pandoc.path.join({pandoc.system.get_working_directory(),runtime_script}) end
local runtime_directory=pandoc.path.directory(runtime_script)

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

local function meta_text(value, field, maximum, blank)
  local kind=pandoc.utils.type(value)
  if kind~='string' and kind~='Inlines' and kind~='MetaString' and kind~='MetaInlines' then fail(field..' requires literal text') end
  local result=pandoc.utils.stringify(value)
  if #result>maximum or result:find('[<>]') then fail(field..' exceeds its text bound or contains markup') end
  local visible=false
  for _,code in utf8.codes(result) do
    if code<32 or (code>=127 and code<=159) then fail(field..' must not contain control characters') end
    local whitespace=code==32 or code==0xA0 or code==0x1680 or (code>=0x2000 and code<=0x200A) or code==0x2028 or code==0x2029 or code==0x202F or code==0x205F or code==0x3000 or code==0xFEFF
    visible=visible or not whitespace
  end
  if not blank and not visible then fail(field..' must not be blank') end
  return result
end
local function meta_map(value,field)
  local kind=pandoc.utils.type(value)
  if kind~='table' and kind~='MetaMap' then fail(field..' requires a mapping') end
  return value
end
local function meta_list(value,field)
  local kind=pandoc.utils.type(value)
  if kind~='List' and kind~='MetaList' then fail(field..' requires a sequence') end
  return value
end
local function language_tag(value)
  if #value>63 or not value:match('^[A-Za-z][A-Za-z%-0-9]*$') or value:find('%-%-') or value:sub(-1)=='-' then return false end
  local parts={};for part in value:gmatch('[^%-]+') do parts[#parts+1]=part end
  if #parts[1]<2 or #parts[1]>8 or not parts[1]:match('^[A-Za-z]+$') then return false end
  local index=2
  if parts[index] and #parts[index]==4 and parts[index]:match('^[A-Za-z]+$') then index=index+1 end
  if parts[index] and ((#parts[index]==2 and parts[index]:match('^[A-Za-z]+$')) or (#parts[index]==3 and parts[index]:match('^%d+$'))) then index=index+1 end
  local seen={}
  for at=index,#parts do local part=parts[at]
    if not ((#part>=5 and #part<=8 and part:match('^[A-Za-z0-9]+$')) or (#part==4 and part:match('^%d[A-Za-z0-9]+$'))) or seen[part:lower()] then return false end
    seen[part:lower()]=true
  end
  return true
end
local function braille_file(value)
  local configured=meta_text(value,'intent-speech.braille-literals-file',4096)
  if configured:find('[\\:%?#%c%s]') or configured:sub(1,1)=='/' or not configured:lower():match('%.ya?ml$') then
    fail('braille-literals-file requires a relative .yml or .yaml path without URLs, encodings or whitespace')
  end
  local root,source=catalogue_api.source()
  -- Inherited metadata and ordinary nested documents may point to ../shared.
  -- Fold effective components explicitly: Pandoc normalize retains '..'. The
  -- reader still checks every physical descendant and refuses linked aliases.
  local parts={}
  for part in (pandoc.path.directory(source):gsub('\\','/')..'/'..configured):gmatch('[^/]+') do
    if part=='..' then
      if #parts==0 then fail('braille-literals-file must remain inside the native project') end
      table.remove(parts)
    elseif part~='.' then parts[#parts+1]=part end
  end
  local filename=table.concat(parts,'/')
  if filename=='' or filename:find('[:\\%c]') then fail('braille-literals-file must remain inside the native project') end
  for part in filename:gmatch('[^/]+') do
    if part=='.' or part=='..' or part:lower()=='.git' or part:lower()=='.quarto' or part:lower()=='_extensions' then fail('braille-literals-file must remain in an ordinary public-authoring project folder') end
  end
  local ok,output=pcall(pandoc.pipe,os.getenv('QUARTO_BIN') or 'quarto',{'run',pandoc.path.join({runtime_directory,'literal-file.ts'})},quarto.json.encode({version=1,root=root,path=filename}))
  if not ok then fail('braille-literals-file requires an ordinary confined UTF-8 YAML file of at most 65536 bytes, without symlinks or junctions') end
  local observed=pandoc.json.decode(output)
  if type(observed)~='table' or observed.version~=1 or observed.path~=filename or type(observed.raw)~='string' or #observed.raw>65536 then fail('braille-literals-file returned invalid literal data') end
  local data=dofile(pandoc.path.join({runtime_directory,'literal-yaml.lua'})).decode(observed.raw,{fail=fail,json=pandoc.json.decode,list=function()return pandoc.List()end,null=pandoc.json.decode('null')})
  data=meta_map(data,'braille-literals-file')
  for key in pairs(data) do if key~='version' and key~='braille-literals' then fail('braille-literals-file contains an unknown field') end end
  if data.version~=1 or data['braille-literals']==nil then fail('braille-literals-file requires version: 1 and a braille-literals sequence') end
  return meta_list(data['braille-literals'],'braille-literals-file.braille-literals')
end
local function realisations(value)
  value=meta_map(value,'intent-speech')
  local allowed={enabled=true,language=true,rules=true,['braille-literals']=true,['braille-literals-file']=true}
  for key in pairs(value) do if not allowed[key] then fail('unknown intent-speech option') end end
  if value.enabled~=nil and type(value.enabled)~='boolean' then fail('intent-speech.enabled requires a boolean') end
  local result={version=1,language=value.language and meta_text(value.language,'intent-speech.language',63) or 'en',rules={},['braille-literals']={}}
  if not language_tag(result.language) then fail('intent-speech.language requires a supported well-formed BCP47 tag') end
  local ids,concepts={},{}
  local function common(entry,field,keys)
    entry=meta_map(entry,field)
    for key in pairs(entry) do if not keys[key] then fail(field..' contains an unknown field') end end
    local record={id=meta_text(entry.id,field..'.id',64),revision=meta_text(entry.revision,field..'.revision',128),
      review=meta_text(entry.review,field..'.review',32),['reviewed-by']=meta_text(entry['reviewed-by'],field..'.reviewed-by',256)}
    if not record.id:match('^[a-z][a-z0-9%-]*$') or ids[record.id] then fail(field..' requires distinct lowercase IDs') end
    ids[record.id]=true
    if record.review~='author-reviewed' then fail(field..'.review must be author-reviewed') end
    return entry,record
  end
  if value.rules then
    local rules=meta_list(value.rules,'intent-speech.rules');if #rules>32 then fail('intent-speech.rules exceeds 32 entries') end
    for _,raw in ipairs(rules) do
      local entry,record=common(raw,'intent-speech rule',{id=true,revision=true,concept=true,roles=true,template=true,review=true,['reviewed-by']=true})
      record.concept=meta_text(entry.concept,'speech concept',64)
      if not intent_grammar.isNCName(record.concept,64) or concepts[record.concept] then fail('speech concepts require distinct Unicode NCNames') end
      concepts[record.concept]=true;record.roles={};local roles={}
      for _,rawRole in ipairs(meta_list(entry.roles,'speech roles')) do
        local role=meta_text(rawRole,'speech role',64)
        if not intent_grammar.isNCName(role,64) or roles[role] then fail('speech roles require distinct Unicode NCNames') end
        record.roles[#record.roles+1]=role;roles[role]=0
      end
      if #record.roles<1 or #record.roles>4 then fail('speech rules require one to four roles') end
      record.template=meta_text(entry.template,'speech template',1024)
      if record.template:find('[<>]') then fail('speech template requires plain text without markup') end
      local rest=record.template:gsub('{([^{}]+)}',function(role)
        if roles[role]==nil then fail('speech template contains an undeclared role') end
        roles[role]=roles[role]+1;return ''
      end)
      if rest:find('[{}]') then fail('speech template contains unmatched braces') end
      for _,count in pairs(roles) do if count~=1 then fail('speech template must use each role exactly once') end end
      result.rules[#result.rules+1]=record
    end
  end
  local entries={}
  if value['braille-literals'] then
    local inline=meta_list(value['braille-literals'],'intent-speech.braille-literals')
    if #inline>0 then fail('exact Braille cells cannot use Markdown metadata; put the literal records in a YAML braille-literals-file instead') end
  end
  if value['braille-literals-file']~=nil then entries=braille_file(value['braille-literals-file']) end
  if #entries>16 then fail('braille-literals exceeds 16 entries') end
  if #entries>0 then
    for _,raw in ipairs(entries) do
      local entry,record=common(raw,'braille literal',{id=true,revision=true,['expression-sha256']=true,meaning=true,code=true,language=true,cells=true,review=true,['reviewed-by']=true})
      record['expression-sha256']=meta_text(entry['expression-sha256'],'braille expression-sha256',64)
      if #record['expression-sha256']~=64 or not record['expression-sha256']:match('^[a-f0-9]+$') then fail('braille expression-sha256 requires 64 lowercase hexadecimal digits') end
      record.meaning=meta_text(entry.meaning,'braille meaning',2048)
      if not intent_grammar.parseIntent(record.meaning) then fail('braille meaning requires a valid bounded intent') end
      record.code=meta_text(entry.code,'braille code',128);record.language=meta_text(entry.language,'braille language',63)
      if not language_tag(record.language) then fail('braille language requires a supported well-formed BCP47 tag') end
      -- This value comes directly from the literal YAML reader, never Markdown.
      if type(entry.cells)~='string' then fail('braille cells require literal text from braille-literals-file') end
      record.cells=entry.cells
      if #record.cells>4096 then fail('braille cells exceed 4096 UTF-8 bytes') end
      local visible=false
      for _,code in utf8.codes(record.cells) do
        if code~=32 and code~=10 and (code<0x2800 or code>0x28FF) then fail('braille cells allow only Unicode Braille, spaces and line feeds') end
        if code>0x2800 and code<=0x28FF then visible=true end
      end
      if not visible then fail('braille cells require a nonblank Unicode Braille cell') end
      result['braille-literals'][#result['braille-literals']+1]=record
    end
  end
  local function array(entries)local out={};for _,entry in ipairs(entries) do out[#out+1]=quarto.json.encode(entry) end;return '['..table.concat(out,',')..']' end
  local json='{"version":1,"language":'..quarto.json.encode(result.language)..',"rules":'..array(result.rules)..',"braille-literals":'..array(result['braille-literals'])..'}'
  if #json>65536 then fail('intent-speech realisations exceed 65536 UTF-8 bytes') end
  return value.enabled~=false,result,json
end

local function enabled_config(meta)
  local config = { enabled = true, ['theorem-controls'] = true, semantics = 'off', ['mathml-output']='internal', ['intent-speech']=false,catalogue=false,
    labels = { proof='Proof', hint='Hint', assumptions='Assumptions',
      related='Explore this statement', back='Back to statement', level='Explanation level', all='All explanations' } }
  local input = meta['accessible-maths']
  if not input then return config end
  if pandoc.utils.type(input) ~= 'table' and pandoc.utils.type(input) ~= 'MetaMap' then
    fail('accessible-maths options must be a mapping')
  end
  for key, value in pairs(input) do
    if not ({enabled=true,['theorem-controls']=true,semantics=true,['mathml-output']=true,['intent-speech']=true,catalogue=true,labels=true})[key] then fail('unknown accessible-maths option; use the documented option names') end
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
    elseif key=='intent-speech' and type(value)~='boolean' then
      config[key],config.realisations,config.realisations_json=realisations(value)
    else
      if type(value) ~= 'boolean' then fail(key .. ' must be a boolean') end
      config[key] = value
    end
  end
  if config.enabled and config['mathml-output'] == 'assistive' and config.semantics ~= 'author-annotated' then
    fail('mathml-output: assistive requires semantics: author-annotated')
  end
  if config.enabled and config['intent-speech'] and config.semantics ~= 'author-annotated' then
    fail('intent-speech: true requires semantics: author-annotated')
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
  ['am-args']=true, ['am-intent']=true, ['am-tex']=true,['am-optional']=true,['am-default']=true,
  ['am-review']=true,['am-public']=true,['am-scope']=true }

-- Only required brace-delimited arguments are supported. Escaped braces do not
-- change the nesting level. Code spans/blocks are never passed to this parser.

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
  -- Quarto's website metadata pipeline temporarily appends hidden copies of
  -- title/social-description markup to the body. They are removed by native
  -- finalization, so repeated IDs there are not rendered-body identities.
  -- Keep the exact container out of every AM body/API pass, then put that same
  -- untouched tree back at its original position. Metadata annotations remain
  -- outside AM's authoring contract; ordinary hidden body content stays checked.
  local metadata_slots, metadata_envelopes, original_block_count = {}, {}, #doc.blocks
  if html then
    local body = pandoc.Blocks({})
    for index, block in ipairs(doc.blocks) do
      if block.t == 'Div' and block.identifier == 'quarto-meta-markdown'
          and block.classes:includes('hidden') then
        metadata_slots[index] = block
        metadata_envelopes[#metadata_envelopes + 1] = block
      else body:insert(block) end
    end
    if #metadata_envelopes > 0 then doc.blocks = body end
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
    if semantic and catalogue_api.owns_semantic_identity(el) then
      if not uri(semantic) then fail(location(id) .. ': semantic-id must be an absolute URI') end
      if semantic_ids[semantic] then fail(location(id) .. ': duplicate semantic-id; give each meaning a distinct URI in this document') end
      semantic_ids[semantic] = id
    end
  end
  -- Reserve the native container's own ID, so authored body markup cannot
  -- collide with it or create a second apparent transport container.
  for _, envelope in ipairs(metadata_envelopes) do collect(envelope) end
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
  end, Header=collect, Span=collect, Code=collect, CodeBlock=collect,
    Link=collect, Image=collect, Table=collect, Figure=collect })
  if doc.meta['accessible-maths-catalogue'] then fail('reserved accessible-maths-catalogue metadata is already present') end
  local authoring=catalogue_api.prepare(doc)
  local catalogue=catalogue_api.capture(doc,authoring)
  if config.catalogue then
    local packet=catalogue.status=='empty' and ('{"version":1,"kind":"accessible-maths-catalogue","status":"empty","source":'..quarto.json.encode(catalogue.source)..',"records":[]}') or quarto.json.encode(catalogue)
    doc.meta['accessible-maths-catalogue']=pandoc.MetaString(packet)
    if html then
      if ids['accessible-maths-catalogue'] then fail('reserved catalogue identifier conflicts with authored content') end
      local safe=packet:gsub('<','\\u003c'):gsub('>','\\u003e'):gsub('&','\\u0026'):gsub(utf8.char(0x2028),'\\u2028'):gsub(utf8.char(0x2029),'\\u2029')
      quarto.doc.include_text('after-body','<script type="application/json" id="accessible-maths-catalogue">'..safe..'</script>')
    end
  end
  registry=authoring.root.env
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
  local math_count=0
  local annotated=html and config.semantics=='author-annotated'
  if authoring.macroCount>0 or annotated then doc,math_count=catalogue_api.rewrite(doc,authoring,annotated) end
  local rewrite={}
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
        .. escape(config.labels.related) .. '"><p>' .. escape(config.labels.related) .. '</p><ul role="list">' .. table.concat(links) .. '</ul></div>'))
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
    quarto.doc.add_html_dependency({ name='accessible-maths-controls', version='0.0.10',
      scripts={'theorem-controls.js'}, stylesheets={'theorem-controls.css'} })
  end
  if html and config.semantics == 'author-annotated' and math_count > 0 then
    local attributes={['data-am-mathml-output']=config['mathml-output']}
    if config['intent-speech'] then attributes['data-am-intent-speech']='true' end
    if config['intent-speech'] and config.realisations_json then
      if ids['accessible-maths-realisations'] then fail('reserved realisations identifier conflicts with authored content') end
      local json=config.realisations_json:gsub('<','\\u003c'):gsub('>','\\u003e'):gsub('&','\\u0026'):gsub(utf8.char(0x2028),'\\u2028'):gsub(utf8.char(0x2029),'\\u2029')
      quarto.doc.include_text('in-header','<script type="application/json" id="accessible-maths-realisations">'..json..'</script>')
      attributes['data-am-realisations']='accessible-maths-realisations'
    end
    quarto.doc.add_html_dependency({ name='accessible-maths-semantics', version='0.0.10',
      scripts={'intent-grammar.js','intent-speech.js',{path='mathjax-adapter.js', attribs=attributes}},
      stylesheets=config['intent-speech'] and {'intent-speech.css'} or {} })
  end
  -- Page-local interoperability data is inert, explicit and independent of the
  -- renderer. This is a declarations slice of shared v0, not a KG snapshot or
  -- an inference about expressions, mathematical truth or included-file spans.
  declarations={}
  for _,entry in ipairs(authoring.declarations) do if entry.exportable then declarations[#declarations+1]=entry end end
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
    for anchor,notation in pairs(authoring.notations) do notation_by_id[anchor]=catalogue_api.notation(notation) end
    table.sort(declarations, function(a, b) return a.id < b.id end)
    for _, declaration in ipairs(declarations) do
      local location = {document=source, anchor=declaration.anchor, precision='anchor'}
      local object = {id=declaration.id, type=declaration.type,
        labels={{language=language, text=declaration.label}}, origin='author-declared',
        reviewStatus='not-asserted', source=location,
        publication={decision='rendered-source', licence='not-asserted'}}
      object.notation = notation_by_id[declaration.anchor]
      objects[#objects + 1] = object
      occurrences[#occurrences + 1] = {id=declaration.anchor, target=declaration.id, source=location,
        destination=fragment(declaration.anchor)}
    end
    local payload = {schemaVersion=1, contractVersion='0', kind='accessible-maths-declarations',
      producer={name='accessible-maths', version='0.0.10'},
      scope={type='document', source=source, occurrenceIds='document-local'},
      coverage='explicit-native-declarations-only', objects=objects, occurrences=occurrences}
    local json = quarto.json.encode(payload):gsub('<', '\\u003c'):gsub('>', '\\u003e'):gsub('&', '\\u0026')
      :gsub(utf8.char(0x2028), '\\u2028'):gsub(utf8.char(0x2029), '\\u2029')
    quarto.doc.include_text('after-body', '<script type="application/json" id="accessible-maths-declarations">' .. json .. '</script>')
  end
  if #metadata_envelopes > 0 then
    if #doc.blocks ~= original_block_count - #metadata_envelopes then
      fail('native metadata transport could not be restored without changing body order')
    end
    local restored, next_body = pandoc.Blocks({}), 1
    for index = 1, original_block_count do
      if metadata_slots[index] then restored:insert(metadata_slots[index])
      else restored:insert(doc.blocks[next_body]); next_body = next_body + 1 end
    end
    doc.blocks = restored
  end
  return doc
end

return { Pandoc=process }
