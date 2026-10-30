-- Copyright 2026 Kai Prince
-- SPDX-License-Identifier: Apache-2.0
-- Reused from Kai Prince's Maths Knowledge Graph literal-yaml.lua (Apache-2.0).
-- This standalone utility does not embed or install that extension.
-- A bounded literal YAML authoring subset, not a general YAML implementation.
-- No Markdown interpretation, tags, aliases, anchors, merges or implicit dates.
local M = {}

function M.decode(raw, ctx)
  local function fail() ctx.fail('YAML data must use bounded literal mappings, sequences and scalars; aliases, tags, duplicate keys and multiple documents are not supported') end
  if #raw > 2097152 or raw:find('[%z\1-\8\11\12\14-\31]') then fail() end
  raw = raw:gsub('^\239\187\191', ''):gsub('\r\n', '\n')
  if raw:find('\r', 1, true) then fail() end
  local rows = {}
  for line in (raw:sub(-1)=='\n' and raw or raw .. '\n'):gmatch('(.-)\n') do
    local spaces, body = line:match('^( *)(.*)$')
    if body:sub(1, 1) == '\t' then fail() end
    rows[#rows+1] = {indent=#spaces, body=body, raw=line}
  end
  local function trim(s) return s:match('^%s*(.-)%s*$') end
  local function empty(row) return row.body:match('^%s*$') or row.body:match('^#') end
  local function quote_starts(s,i)
    local j=i-1
    while j>0 and s:sub(j,j):match('%s') do j=j-1 end
    local previous=s:sub(j,j)
    return j==0 or previous==':' or previous==',' or previous=='[' or previous=='{'
  end
  local function comment(s)
    local quoted, escaped, nesting, i = nil, false, 0, 1
    while i<=#s do
      local c=s:sub(i,i)
      if quoted then
        if escaped then escaped=false
        elseif quoted=='"' and c=='\\' then escaped=true
        elseif c==quoted then
          if quoted=="'" and s:sub(i+1,i+1)=="'" then i=i+1 else quoted=nil end
        end
      elseif (c=='"' or c=="'") and quote_starts(s,i) then quoted=c
      elseif c=='[' or c=='{' then nesting=nesting+1
      elseif c==']' or c=='}' then nesting=nesting-1
      elseif c=='#' and (i==1 or s:sub(i-1,i-1):match('%s')) and nesting==0 then return trim(s:sub(1,i-1)) end
      i=i+1
    end
    return trim(s)
  end
  local function separator(s, flow)
    local quoted, escaped, nesting, i = nil, false, 0, 1
    while i<=#s do
      local c=s:sub(i,i)
      if quoted then
        if escaped then escaped=false
        elseif quoted=='"' and c=='\\' then escaped=true
        elseif c==quoted then
          if quoted=="'" and s:sub(i+1,i+1)=="'" then i=i+1 else quoted=nil end
        end
      elseif (c=='"' or c=="'") and quote_starts(s,i) then quoted=c
      elseif c=='[' or c=='{' then nesting=nesting+1
      elseif c==']' or c=='}' then nesting=nesting-1
      elseif c==':' and nesting==0 and (i==#s or s:sub(i+1,i+1):match('%s')
        or (flow and (s:sub(1,1)=='"' or s:sub(1,1)=="'"))) then return i end
      i=i+1
    end
  end
  local scalar
  local function parts(s)
    local result, start, quoted, escaped, depth, i = {}, 1, nil, false, 0, 1
    while i<=#s do
      local c=s:sub(i,i)
      if quoted then
        if escaped then escaped=false
        elseif quoted=='"' and c=='\\' then escaped=true
        elseif c==quoted then if quoted=="'" and s:sub(i+1,i+1)=="'" then i=i+1 else quoted=nil end end
      elseif (c=='"' or c=="'") and quote_starts(s,i) then quoted=c
      elseif c=='[' or c=='{' then depth=depth+1
      elseif c==']' or c=='}' then depth=depth-1;if depth<0 then fail() end
      elseif c==',' and depth==0 then result[#result+1]=trim(s:sub(start,i-1));start=i+1 end
      i=i+1
    end
    if quoted or depth~=0 then fail() end
    result[#result+1]=trim(s:sub(start))
    return result
  end
  local function key(s)
    s=trim(s)
    if s=='<<' or s=='' or s:match('^[%[%{]') then fail() end
    local v=scalar(s,1)
    if type(v)~='string' or #v>4096 or v=='' or v=='<<' then fail() end
    return v
  end
  scalar=function(s,depth)
    if depth>64 then fail() end
    s=trim(s)
    local first,last=s:sub(1,1),s:sub(-1)
    if s=='' then fail() end
    if first=="'" then
      if last~="'" or #s<2 then fail() end
      local inner=s:sub(2,-2)
      if inner:gsub("''",''):find("'",1,true) then fail() end
      return (inner:gsub("''","'"))
    elseif first=='"' then
      -- JSON-compatible double quotes have precisely specified escapes. Use
      -- single quotes or a literal block for TeX and other backslash strings.
      local ok,value=pcall(ctx.json,s)
      if not ok or type(value)~='string' then fail() end
      return value
    elseif first=='[' or first=='{' then
      if (first=='[' and last~=']') or (first=='{' and last~='}') then fail() end
      local inner=trim(s:sub(2,-2))
      local result=first=='[' and ctx.list() or {}
      if inner=='' then return result end
      for _,part in ipairs(parts(inner)) do
        if part=='' then fail() end
        if first=='[' then result[#result+1]=scalar(part,depth+1)
        else
          local colon=separator(part,true);if not colon then fail() end
          local name=key(part:sub(1,colon-1));if result[name]~=nil then fail() end
          result[name]=scalar(part:sub(colon+1),depth+1)
        end
      end
      return result
    end
    if s:match('^[!&*|>@`%%]') or s:match('^%-[ %s]') or s:match('^%?[ %s]') or s:find('[\t\r\n]') or separator(s,false) then fail() end
    if s=='null' or s=='Null' or s=='NULL' or s=='~' then return ctx.null end
    if s=='true' or s=='True' or s=='TRUE' then return true end
    if s=='false' or s=='False' or s=='FALSE' then return false end
    -- Restrict implicit numbers to JSON grammar. Ambiguous YAML numeric forms
    -- (leading zero, hex, infinity and explicit plus) must be quoted instead.
    if s:match('^[%+%-]?%d') or s:match('^[%+%-]?%.%d') or s:lower():match('^[%+%-]?%.inf$') or s:lower()=='.nan' then
      local ok,value=pcall(ctx.json,s)
      if not ok or type(value)~='number' or value~=value or value==math.huge or value==-math.huge then fail() end
      return value
    end
    return s
  end
  local position, nodes = 1, 0
  local function skip() while rows[position] and empty(rows[position]) do position=position+1 end end
  local function block_text(parent, indicator)
    if not indicator:match('^[|>][%+%-]?$') then fail() end
    local start, indentation=position,nil
    while rows[position] and (rows[position].raw:match('^%s*$') or rows[position].indent>parent) do
      local row=rows[position]
      -- A leading # is literal inside a block scalar, not a YAML comment.
      if not row.raw:match('^%s*$') then indentation=indentation or row.indent end
      position=position+1
    end
    indentation=indentation or parent+1
    local lines={}
    for i=start,position-1 do
      local row=rows[i]
      if not row.raw:match('^%s*$') and row.indent<indentation then fail() end
      lines[#lines+1]=row.raw:sub(indentation+1)
    end
    -- Literal blocks are useful for long labels/TeX. Folded blocks are
    -- deliberately refused: YAML folding depends on more-indented paragraphs.
    if indicator:sub(1,1)=='>' then fail() end
    local value=table.concat(lines,'\n') .. (#lines>0 and '\n' or '')
    if indicator:sub(-1)=='-' then return value:gsub('\n+$','') end
    if indicator:sub(-1)=='+' then return value end
    return value:gsub('\n+$','') .. (#lines>0 and '\n' or '')
  end
  local block
  local function value(rest,parent,depth)
    rest=comment(rest)
    if rest:sub(1,1)=='|' or rest:sub(1,1)=='>' then return block_text(parent,rest) end
    if rest~='' then return scalar(rest,depth) end
    skip()
    if rows[position] and rows[position].indent>parent then return block(rows[position].indent,depth) end
    return ctx.null
  end
  block=function(indent,depth,pending)
    if depth>64 then fail() end
    skip()
    local opening=pending or rows[position]
    local islist=opening and opening.body:match('^%-%s') or opening and opening.body=='-'
    local result=islist and ctx.list() or {}
    while pending or rows[position] do
      skip()
      local virtual=pending~=nil
      local row=pending or rows[position]
      pending=nil
      if not row or row.indent<indent then break end
      if row.indent~=indent then fail() end
      nodes=nodes+1;if nodes>100000 then fail() end
      if islist then
        local rest=row.body:match('^%-%s+(.*)$')
        if row.body=='-' then rest='' end
        if rest==nil then break end
        if not virtual then position=position+1 end
        -- A conventional '- id: value' opens a block mapping at indent+2.
        -- A virtual opening row avoids repeated table.insert over the complete
        -- catalogue: parsing a large sequence stays linear in its row count.
        if separator(comment(rest),false) or rest:match('^%-%s') or rest=='-' then
          result[#result+1]=block(indent+2,depth+1,{indent=indent+2,body=rest,raw=string.rep(' ',indent+2)..rest})
        else result[#result+1]=value(rest,indent,depth+1) end
      else
        local body=comment(row.body)
        if body=='---' or body=='...' then break end
        local colon=separator(body,false);if not colon then fail() end
        local name=key(body:sub(1,colon-1));if result[name]~=nil then fail() end
        if not virtual then position=position+1 end
        result[name]=value(body:sub(colon+1),indent,depth+1)
      end
    end
    return result
  end
  skip()
  if rows[position] and rows[position].body=='---' then position=position+1;skip() end
  if not rows[position] or rows[position].indent~=0 then fail() end
  local result=block(0,1)
  skip()
  if rows[position] and rows[position].body=='...' then position=position+1;skip() end
  if rows[position] then fail() end
  return result
end

return M
