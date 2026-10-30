-- Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
-- Original bounded MathML 4 WD 2026-10-02 section 5.1 parser.
-- Pure UTF-8 data in; nil or a literal AST out. No normalization or speech.
local M = {version=1, LIMITS={maxBytes=2048,maxDepth=32,maxNodes=512,maxProperties=128,maxArguments=128,maxNameBytes=512}}
local function array() return setmetatable({}, {__am_array=true}) end
local function start(cp)
  return cp==95 or cp>=65 and cp<=90 or cp>=97 and cp<=122
    or cp>=0xc0 and cp<=0xd6 or cp>=0xd8 and cp<=0xf6 or cp>=0xf8 and cp<=0x2ff
    or cp>=0x370 and cp<=0x37d or cp>=0x37f and cp<=0x1fff or cp>=0x200c and cp<=0x200d
    or cp>=0x2070 and cp<=0x218f or cp>=0x2c00 and cp<=0x2fef or cp>=0x3001 and cp<=0xd7ff
    or cp>=0xf900 and cp<=0xfdcf or cp>=0xfdf0 and cp<=0xfffd or cp>=0x10000 and cp<=0xeffff
end
local function continuation(cp)
  return start(cp) or cp==45 or cp==46 or cp>=48 and cp<=57 or cp==0xb7
    or cp>=0x300 and cp<=0x36f or cp>=0x203f and cp<=0x2040
end
local function characters(value, maximum)
  if type(value)~='string' or #value==0 or #value>maximum then return nil end
  local chars={};local ok=pcall(function()
    for _,cp in utf8.codes(value) do if cp>=0xd800 and cp<=0xdfff then error('invalid-utf8') end;chars[#chars+1]={text=utf8.char(cp),cp=cp} end
  end)
  return ok and chars or nil
end
function M.isNCName(value, maximum)
  if maximum==nil then maximum=M.LIMITS.maxNameBytes end
  if type(maximum)~='number' or maximum%1~=0 or maximum<1 or maximum>M.LIMITS.maxNameBytes then return false end
  local chars=characters(value,maximum);if not chars or not start(chars[1].cp) then return false end
  for index=2,#chars do if not continuation(chars[index].cp) then return false end end
  return true
end
function M.parseIntent(value)
  local chars=characters(value,M.LIMITS.maxBytes);if not chars then return nil end
  local function invalid() error('invalid-intent',0) end
  local position,nodes,properties,arguments_count=1,0,0,0
  local references,counts=array(),{}
  local function at() return chars[position] and chars[position].text end
  local function digit(char) return char and char>='0' and char<='9' end
  local function skip() while at()==' ' or at()=='\t' or at()=='\r' or at()=='\n' do position=position+1 end end
  local function join(first,last) local result={};for index=first,last do result[#result+1]=chars[index].text end;return table.concat(result) end
  local function node(value) nodes=nodes+1;if nodes>M.LIMITS.maxNodes then invalid() end;value.properties=array();return value end
  local function name()
    local first=position;if not chars[position] or not start(chars[position].cp) then invalid() end;position=position+1
    while chars[position] and continuation(chars[position].cp) do position=position+1 end
    local result=join(first,position-1);if #result>M.LIMITS.maxNameBytes then invalid() end;return result
  end
  local function property(target)
    properties=properties+1;if at()~=':' or properties>M.LIMITS.maxProperties then invalid() end;position=position+1
    target.properties[#target.properties+1]=name()
  end
  local expression
  expression=function(depth)
    if depth>M.LIMITS.maxDepth then invalid() end;skip();local result
    if at()=='$' then
      position=position+1;local value=name();result=node({kind='reference',name=value})
      if counts[value]==nil then references[#references+1]=value;counts[value]=0 end;counts[value]=counts[value]+1
    elseif at()=='-' or digit(at()) then
      local first=position;if at()=='-' then position=position+1 end
      if not digit(at()) then invalid() end;while digit(at()) do position=position+1 end
      if at()=='.' and chars[position+1] and digit(chars[position+1].text) then position=position+1;while digit(at()) do position=position+1 end end
      result=node({kind='number',value=join(first,position-1)})
    else
      local value=name();result=node({kind=value:sub(1,1)=='_' and 'literal' or 'concept',name=value})
    end
    while true do
      skip()
      if at()==':' then property(result)
      elseif at()=='(' then
        position=position+1;skip();local args=array()
        if at()~=')' then while true do
          arguments_count=arguments_count+1;if arguments_count>M.LIMITS.maxArguments then invalid() end
          args[#args+1]=expression(depth+1);skip();if at()~=',' then break end;position=position+1
        end end
        if at()~=')' then invalid() end;position=position+1;result=node({kind='application',head=result,args=args})
      else return result end
    end
  end
  local ok,result=pcall(function()
    skip();local ast
    if at()==':' then ast=node({kind='self-properties'});repeat property(ast);skip() until at()~=':' else ast=expression(0) end
    skip();if position<=#chars then invalid() end
    local pending={{node=ast,depth=1}}
    while #pending>0 do local item=table.remove(pending);if item.depth>M.LIMITS.maxDepth then invalid() end
      if item.node.kind=='application' then
        pending[#pending+1]={node=item.node.head,depth=item.depth+1}
        for _,child in ipairs(item.node.args) do pending[#pending+1]={node=child,depth=item.depth+1} end
      end
    end
    local reference_counts=array();for _,name in ipairs(references) do reference_counts[#reference_counts+1]={name=name,count=counts[name]} end
    return {ast=ast,references=references,referenceCounts=reference_counts}
  end)
  return ok and result or nil
end
return M
