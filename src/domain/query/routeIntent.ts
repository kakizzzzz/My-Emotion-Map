export type QueryIntent =
  | 'lookup'
  | 'comparison'
  | 'pattern'
  | 'reflection'
  | 'unsupported';

export const routeQueryIntent = (query: string): QueryIntent => {
  if (/诊断|抑郁症|焦虑症|人格|潜意识|diagnos|disorder|personality|진단|성격/i.test(query)) {
    return 'unsupported';
  }
  if (/比较|相比|区别|versus|\bvs\b|compare|비교/i.test(query)) return 'comparison';
  if (/经常|重复|规律|哪些地方|pattern|often|repeat|자주|반복/i.test(query)) return 'pattern';
  if (/怎么看|回看|想起|reflect|looking back|돌아보/i.test(query)) return 'reflection';
  if (/\b20\d{2}-\d{1,2}-\d{1,2}\b|20\d{2}年\d{1,2}月\d{1,2}日|今天|昨天|前天|today|yesterday|오늘|어제/i.test(query)) {
    return 'lookup';
  }
  return 'reflection';
};
