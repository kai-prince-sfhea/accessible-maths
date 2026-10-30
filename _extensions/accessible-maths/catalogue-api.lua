-- Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
-- Original current-native-AST API, not a previous-render HTML reader.
local M={version=1}
local cwd=pandoc.system.get_working_directory()
local module=debug.getinfo(1,'S').source:sub(2)
if not pandoc.path.is_absolute(module) then module=pandoc.path.join({cwd,module}) end
local directory=pandoc.path.directory(module)
local modules=rawget(_G,'__accessible_maths_catalogue_modules_v1') or {}
assert(type(modules)=='table','accessible-maths: incompatible catalogue module registry')
if modules[module] then
  assert(type(modules[module])=='table' and modules[module].version==1 and type(modules[module].capture)=='function' and type(modules[module].owns_semantic_identity)=='function','accessible-maths: incompatible catalogue API')
  return modules[module]
end
local intent_grammar=dofile(pandoc.path.join({directory,'intent-grammar.lua'}))
local function fail(message) assert(false,'accessible-maths: '..message) end
local function location(_) return 'author annotation' end
local function uri(value) return value and #value<=2048 and value:match('^[A-Za-z][A-Za-z0-9+.-]*:[^%s<>"{}]+$') end
local prefixes={thm=true,lem=true,cor=true,prp=true,cnj=true,def=true,exm=true,exr=true}
local function canonical(el) return prefixes[el.identifier:match('^([a-z]+)%-')] or el.identifier:match('^prf%-') or el.classes:includes('proof') end
-- A canonical URI can have several foreign language/content realizations.
-- AM registers identities only for native maths or its own explicit markers.
-- Foreign classes never opt a native maths declaration out of this ownership.
function M.owns_semantic_identity(el)
  if el.t=='Div' then
    local prefix=el.identifier:match('^([a-z]+)%-')
    if prefixes[prefix] or prefix=='prf' or prefix=='rem' or prefix=='sol' then return true end
    for _,name in ipairs({'proof','remark','solution','am-hint','am-assumption','am-explanation','am-macro-scope'}) do
      if el.classes:includes(name) then return true end
    end
  end
  for name in pairs(el.attributes) do
    if name:match('^am%-') or name=='proof-for' or name=='theorem-for' then return true end
  end
  return false
end
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

local function skip_space(text,position)
  while position<=#text do
    if text:sub(position,position):match('%s') then position=position+1
    elseif text:sub(position,position)=='%' then position=(text:find('\n',position,true) or #text)+1
    else break end
  end
  return position
end
local function argument(text, position, command)
  position=skip_space(text,position)
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

local function optional_argument(text,position,default)
  position=skip_space(text,position)
  if text:sub(position,position)~='[' then return default,position end
  local start,depth=position+1,0;position=position+1
  while position<=#text do
    local char=text:sub(position,position)
    if char=='\\' then
      local first,last,control=text:find('\\([A-Za-z]+)',position)
      if first==position and control=='verb' then position=verbatim_end(text,last)+1 else position=position+2 end
    elseif char=='%' then position=(text:find('\n',position,true) or #text)+1
    else
      if char=='{' then depth=depth+1 elseif char=='}' then depth=depth-1 end
      if depth<0 then fail('optional semantic macro argument has unmatched braces') end
      if char==']' and depth==0 then return text:sub(start,position-1),position+1 end
      position=position+1
    end
  end
  fail('unterminated optional semantic macro argument; protect an inner closing bracket with braces')
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
    for _, key in ipairs({'am-args', 'am-intent', 'am-tex','am-optional','am-default'}) do
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
  for role in (attrs['am-args'] or ''):gmatch('[^ \t\r\n]+') do
    if not intent_grammar.isNCName(role,64) or seen[role] then fail(location(id) .. ': am-args requires unique Unicode NCName role names of at most 64 UTF-8 bytes') end
    roles[#roles + 1], seen[role] = role, true
  end
  if #roles < 1 or #roles > 4 then fail(location(id) .. ': declare one to four required arguments') end
  local optional=attrs['am-optional']
  if optional and optional~=roles[1] then fail(location(id)..': am-optional must name the first declared role') end
  if optional and attrs['am-default']==nil then fail(location(id)..': am-optional requires am-default (which may be empty)') end
  if not optional and attrs['am-default']~=nil then fail(location(id)..': am-default requires am-optional') end
  local intent = attrs['am-intent'] or ''
  local parsed = intent_grammar.parseIntent(intent)
  if not parsed then fail(location(id) .. ': am-intent requires valid bounded MathML 4 intent syntax') end
  local referenced, count = {}, 0
  for _,reference in ipairs(parsed.referenceCounts) do
    local role=reference.name
    if not seen[role] or reference.count~=1 or referenced[role] then fail(location(id) .. ': am-intent must reference each declared role exactly once') end
    referenced[role], count = true, count + 1
  end
  if count ~= #roles then fail(location(id) .. ': am-intent has missing argument roles') end
  local template = attrs['am-tex'] or ''
  if #template == 0 or #template > 4096 then fail(location(id) .. ': am-tex requires a non-empty bounded TeX template') end
  local parts, commands = compile_template(template, #roles, id)
  local default=attrs['am-default']
  if default then
    if #default>1024 then fail(location(id)..': am-default exceeds 1024 UTF-8 bytes') end
    local _,default_commands=compile_template(default,0,id)
    for name in pairs(default_commands) do commands[name]=true end
  end
  registry[command] = { command=command,roles=roles, intent=intent, template=template, source=id,
    semanticId=attrs['semantic-id'], parts=parts, commands=commands,optional=optional,default=default }
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
    if forbidden_template_commands[command] then fail('semantic macro expressions do not support raw TeX definitions or indirection') end
    if command == 'amIntent' or command == 'amArg' then fail('amIntent/amArg are internal helpers; declare an am-macro on a definition') end
    if declaration then
      local values, next_position = {}, last + 1
      for index, role in ipairs(declaration.roles) do
        local value
        if index==1 and declaration.optional then value,next_position=optional_argument(text,next_position,declaration.default)
        else value, next_position = argument(text, next_position, command) end
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

local function hidden(el)
  if el.classes:includes('content-hidden') or el.classes:includes('content-visible') or el.classes:includes('private') or el.classes:includes('hidden') then return true end
  for name,value in pairs(el.attributes) do
    if name:match('^when%-') or name:match('^unless%-') or name=='hidden' or (name=='aria-hidden' and value=='true') or (name=='am-public' and value=='false') or (name=='public' and value=='false') or (name=='data-private' and value=='true') then return true end
  end
  return false
end
local function knowledge(el)
  local a=el.attributes
  if a['am-review'] or a['am-public'] or a['am-scope'] then
    if not prefixes[el.identifier:match('^([a-z]+)%-')] or not uri(a['semantic-id']) then fail('am-review/am-public/am-scope require an identified native mathematical declaration') end
    if a['am-review'] and a['am-review']~='author-reviewed' then fail('am-review must be author-reviewed') end
    if a['am-public'] and a['am-public']~='true' and a['am-public']~='false' then fail('am-public must be true or false') end
    if a['am-scope'] and (#a['am-scope']>64 or not a['am-scope']:match('^[a-z][a-z0-9%-]*$')) then fail('am-scope requires a lowercase knowledge-context key') end
    if a['am-public']=='true' and (a['am-review']~='author-reviewed' or not a['am-scope']) then fail('am-public true requires am-review author-reviewed and am-scope') end
  end
end
local prepared=setmetatable({}, {__mode='k'})
function M.prepare(doc)
  local state={scopes={},notations={},declarations={},macroCount=0,scopeCount=0,names={}}
  local ids,semanticIds={},{}
  local function identity(el)
    if el.identifier~='' then if ids[el.identifier] then fail('duplicate native identifier') end;ids[el.identifier]=true end
    local semantic=el.attributes['semantic-id'];if semantic and M.owns_semantic_identity(el) then if not uri(semantic) or semanticIds[semantic] then fail('invalid or duplicate semantic-id') end;semanticIds[semantic]=true end
    if el.classes:includes('am-macro-scope') and el.t~='Div' then fail('am-macro-scope requires a Div') end
  end
  doc.blocks:walk({Div=identity,Header=identity,Span=identity,Code=identity,CodeBlock=identity,Link=identity,Image=identity,Table=identity,Figure=identity})
  local function scope(blocks,parent,id,private,depth)
    if depth>16 then fail('macro scope nesting exceeds 16') end
    local current={id=id,own={},env={},parent=parent,private=private,children={}}
    if id then if state.scopes[id] then fail('duplicate macro scope identifier') end;state.scopeCount=state.scopeCount+1;if state.scopeCount>128 then fail('macro scopes exceed 128') end;state.scopes[id]=current end
    local function scan(content,restricted,nesting)
      if nesting>64 then fail('macro declaration container nesting exceeds 64') end
      content:walk({traverse='topdown',Div=function(el)
        local suppressed=restricted or hidden(el)
        if el.classes:includes('am-macro-scope') then
          if el.identifier=='' or #el.identifier>512 or el.identifier:find('[%s%c#"\'<>]') or canonical(el) then fail('am-macro-scope requires a distinct non-theorem native identifier') end
          if state.scopes[el.identifier] then fail('duplicate macro scope identifier') end
          for name in pairs(el.attributes) do if name:match('^am%-') then fail('macro scope containers do not accept definition attributes') end end
          current.children[#current.children+1]={element=el,private=suppressed}
          return el,false
        end
        knowledge(el)
        declare(el,current.own)
        if el.attributes['am-macro'] then
          state.macroCount=state.macroCount+1;if state.macroCount>256 then fail('semantic macro declarations exceed 256') end
          local record=current.own[el.attributes['am-macro']];record.lexicalScope=id and {kind='div',anchor=id} or {kind='document'}
          state.names[el.attributes['am-macro']]=true
          state.notations[el.identifier]=record
        end
        local kind=el.identifier:match('^([a-z]+)%-')
        if prefixes[kind] and el.attributes['semantic-id'] then
          state.declarations[#state.declarations+1]={id=el.attributes['semantic-id'],anchor=el.identifier,type=kind,label=el.attributes.name or el.identifier,
            scope=el.attributes['am-scope'],review=el.attributes['am-review'],public=el.attributes['am-public']=='true',exportable=not suppressed,
            lexicalScope=id and {kind='div',anchor=id} or {kind='document'},body=doc.meta['accessible-maths'] and doc.meta['accessible-maths'].catalogue==true and pandoc.write(pandoc.Pandoc(el.content),'native') or nil}
        end
        scan(el.content,suppressed,nesting+1);return el,false
      end})
    end
    scan(blocks,private,0)
    if parent then for command,entry in pairs(parent.env) do current.env[command]=entry end end
    for command,entry in pairs(current.own) do current.env[command]=entry end
    for _,entry in pairs(current.own) do for command in pairs(entry.commands) do
      if command:match('^am[A-Z]') or current.env[command] or command=='amIntent' or command=='amArg' then fail('am-tex/am-default must contain ordinary visual TeX without semantic macro references') end
    end end
    for _,child in ipairs(current.children) do scope(child.element.content,current,child.element.identifier,child.private,depth+1) end
    return current
  end
  state.root=scope(doc.blocks,nil,nil,false,0)
  local function outside(_,command) if state.names[command] then fail('semantic macro is outside its declared lexical scope') end end
  setmetatable(state.root.env,{__index=outside});for _,entry in pairs(state.scopes) do setmetatable(entry.env,{__index=outside}) end
  prepared[state]={document=doc,token=doc.meta['accessible-maths'] and doc.meta['accessible-maths'].catalogue==true and pandoc.utils.sha1(pandoc.write(doc,'native')) or nil}
  return state
end
function M.rewrite(doc,state,annotated)
  local count=0
  local function transform(blocks,current)
    return blocks:walk({traverse='topdown',Div=function(el)
      if el.classes:includes('am-macro-scope') then el.content=transform(el.content,state.scopes[el.identifier]);return el,false end
    end,Math=function(el)
      count=count+1;if state.macroCount>0 then el.text=expand(el.text,current.env,annotated,0) end;return el
    end})
  end
  doc.blocks=transform(doc.blocks,state.root);return doc,count
end
function M.notation(record)
  if not record then return nil end
  local value={command=record.command,roles=record.roles,intent=record.intent,visualTeX=record.template}
  if record.optional then
    value.signature={version=1,parameters={}}
    for index,role in ipairs(record.roles) do value.signature.parameters[index]={role=role,kind=index==1 and 'optional' or 'required'};if index==1 then value.signature.parameters[index].defaultTeX=record.default end end
  end
  if record.lexicalScope.kind~='document' then value.lexicalScope=record.lexicalScope end
  return value
end
local function native_source()
  local input=quarto.doc.input_file
  local absolute=pandoc.path.is_absolute(input) and input or pandoc.path.join({cwd,input})
  local root
  if quarto.project.directory then
    local offset=quarto.project.offset or '.'
    if type(offset)~='string' or offset:find('^[/\\]') or offset:find('[/\\][/\\]') then fail('unsupported native project offset') end
    root=cwd;for part in offset:gmatch('[^/\\]+') do if part=='..' then root=pandoc.path.directory(root) elseif part~='.' then fail('unsupported native project offset') end end
  else root=pandoc.path.directory(absolute) end
  local source=pandoc.path.make_relative(absolute,root):gsub('\\','/')
  if source:match('^%.%./') or source:match('^/') or source:find('[:\\%c]') then fail('catalogue source must be inside the native project') end
  return root,source
end
M.source=native_source
local cache={}
function M.capture(doc,state)
  local options=doc.meta['accessible-maths']
  if options then
    local kind=pandoc.utils.type(options);if kind~='table' and kind~='MetaMap' then fail('accessible-maths options must be a mapping') end
    if options.enabled~=nil and type(options.enabled)~='boolean' or options.catalogue~=nil and type(options.catalogue)~='boolean' then fail('enabled and catalogue require booleans') end
  end
  local enabled=not options or options.enabled~=false
  if not enabled or not options or options.catalogue~=true then return {version=1,kind='accessible-maths-catalogue',status='disabled'} end
  if state then local receipt=prepared[state];if not receipt or receipt.document~=doc or receipt.token~=pandoc.utils.sha1(pandoc.write(doc,'native')) then fail('catalogue capture requires the current native document') end
  else state=M.prepare(doc) end
  local root,source=native_source();local records={}
  for _,entry in ipairs(state.declarations) do if entry.exportable and entry.public and entry.review=='author-reviewed' then
    records[#records+1]={id=entry.id,type=entry.type,label=entry.label,anchor=entry.anchor,scope=entry.scope,review='author-reviewed',public=true,lexicalScope=entry.lexicalScope,
      notation=M.notation(state.notations[entry.anchor]),body=entry.body}
  end end
  table.sort(records,function(a,b)return a.anchor<b.anchor end)
  if #records==0 then return {version=1,kind='accessible-maths-catalogue',status='empty',source={document=source,precision='containing-document'},records={}} end
  local request={version=1,root=root,source=source,records=records}
  local raw=quarto.json.encode(request)
  local handle=io.open(pandoc.path.join({root,source}),'rb');if not handle then fail('catalogue containing source cannot be read') end
  local source_bytes=handle:read(2097153);handle:close();if not source_bytes or #source_bytes>2097152 then fail('catalogue containing source exceeds its byte bound') end
  local key=pandoc.utils.sha1(raw..'\n'..pandoc.utils.sha1(source_bytes))
  if cache[key] then return quarto.json.decode(cache[key]) end
  local output=pandoc.pipe('quarto',{'run',pandoc.path.join({directory,'catalogue.ts'})},raw)
  local packet=quarto.json.decode(output)
  if type(packet)~='table' or packet.version~=1 or packet.kind~='accessible-maths-catalogue' or packet.status~='complete' then fail('catalogue helper returned an invalid source-bound packet') end
  cache[key]=output;return packet
end
modules[module]=M
_G.__accessible_maths_catalogue_modules_v1=modules
return M
