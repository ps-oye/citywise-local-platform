import { escapeHtml as e } from '../utils/dom.js';
import { normalizeSearch } from '../domain/discovery.js';
import { debounce } from '../utils/debounce.js';
import { icon } from './icons.js';
let sequence = 0;
export function mountSearchBox(root, { repository, getScope, onSearch, onChoose, value = '', label = 'Search local places', placeholder = 'Search food, shops, stays, services…' }) {
  const id = 'discovery-search-' + (++sequence);
  root.innerHTML = '<form class="search-form" role="search"><label class="sr-only" for="'+id+'">'+e(label)+'</label><div class="search-field">'+icon('search')+'<input id="'+id+'" name="q" type="search" autocomplete="off" maxlength="100" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="'+id+'-suggestions" placeholder="'+e(placeholder)+'" value="'+e(value)+'"><button class="search-submit" type="submit" aria-label="Submit '+e(label.toLowerCase())+'">'+icon('arrow')+'</button></div><ul class="search-suggestions" id="'+id+'-suggestions" role="listbox" aria-label="Search suggestions" hidden></ul><span class="sr-only" role="status" data-search-feedback></span></form>';
  const form=root.querySelector('form'), input=root.querySelector('input'), list=root.querySelector('ul'), feedback=root.querySelector('[data-search-feedback]');
  const lifetime=new AbortController();
  let request, items=[], active=-1, version=0;
  function close() { list.hidden=true; input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant'); active=-1; }
  function invalidate(){version++;request?.abort();items=[];list.innerHTML='';feedback.textContent='';close();}
  function highlight(index) {
    active=index;
    list.querySelectorAll('[data-suggestion]').forEach((button,i)=>button.setAttribute('aria-selected',String(i===active)));
    if(active>=0) input.setAttribute('aria-activedescendant',id+'-option-'+active);
    else input.removeAttribute('aria-activedescendant');
  }
  async function query() {
    const text=normalizeSearch(input.value), current=++version;
    request?.abort(); request=new AbortController();
    if(text.length<2){items=[];close();return;}
    try {
      const scope=getScope();
      if(!scope?.cityId){close();return;}
      const data=await repository.listings({...scope,query:text,limit:6,offset:0,sort:'recommended',facets:{}},request.signal);
      if(current!==version || !root.isConnected || !root.contains(document.activeElement))return;
      items=data?.items || [];
      list.innerHTML=items.length?items.map((item,i)=>'<li role="presentation"><button type="button" tabindex="-1" class="suggestion-button" role="option" aria-selected="false" id="'+id+'-option-'+i+'" data-suggestion="'+i+'">'+icon('pin')+'<span><strong>'+e(item.matched_product || item.name)+'</strong><small>'+e(item.matched_product?item.name:(item.category_short_name || item.category_name || '')+' · '+(item.locality_name || ''))+'</small></span>'+icon('chevron')+'</button></li>').join(''):'<li role="option" aria-disabled="true" class="suggestion-message">No suggestions yet. Press Enter to search all places.</li>';
      list.hidden=false; input.setAttribute('aria-expanded','true'); active=-1;
      input.removeAttribute('aria-activedescendant'); feedback.textContent=items.length+' suggestions available.';
    } catch(error) {
      if(error.name==='AbortError' || current!==version)return;
      items=[];close();feedback.textContent='Suggestions are unavailable. Press Enter to search.';
    }
  }
  const schedule=debounce(query,250);
  input.addEventListener('input',()=>{invalidate();schedule();},{signal:lifetime.signal});
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();schedule.cancel();invalidate();}
    if(event.key==='ArrowDown' || event.key==='ArrowUp'){
      event.preventDefault();
      if(list.hidden){schedule.cancel();query();return;}
      if(items.length)highlight((active+(event.key==='ArrowDown'?1:-1)+items.length)%items.length);
    }
    if(event.key==='Enter' && active>=0 && items[active]){event.preventDefault();onChoose(items[active].id,items[active]);close();}
  },{signal:lifetime.signal});
  form.addEventListener('submit',event=>{event.preventDefault();schedule.cancel();invalidate();onSearch(normalizeSearch(input.value));},{signal:lifetime.signal});
  list.addEventListener('click',event=>{const button=event.target.closest('[data-suggestion]');if(button&&items[Number(button.dataset.suggestion)]){const item=items[Number(button.dataset.suggestion)];onChoose(item.id,item);close();}},{signal:lifetime.signal});
  root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget)){schedule.cancel();invalidate();}},{signal:lifetime.signal});
  return ()=>{schedule.cancel();invalidate();lifetime.abort();};
}

