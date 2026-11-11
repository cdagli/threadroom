import {hasKey,type Translator} from '@/lib/i18n';
import {brandLabel,defaultBrand,type Thread} from '@/lib/threads';
// Brother chart names are translated; other charts keep the maker's names (some have none).
export function threadName(t:Translator,thread:Pick<Thread,'brand'|'name'>):string {
  const key=`thread.${thread.name}`;return thread.brand===defaultBrand&&hasKey(key)?t(key):thread.name;
}
export function threadLabel(t:Translator,thread:Thread):string {
  const name=threadName(t,thread);return `${brandLabel(thread.brand)} ${thread.code}${name?` · ${name}`:''}`;
}
