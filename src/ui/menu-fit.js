import { normalize, layoutCSS, continuousMenuCSS } from './menu-layout.js';

// 2026-09-20 実画面で承認済み。受領値を上限として一画面へ収める。
export const RECEIVED = { upperHeight: 58, levelHeight: 70, buttonGap: 20, sectionGap: 16, logoWidth: 290, logoOffset: 19, titleGap: 12 };
export function fitProposal(style, input) {
  const effective = normalize(input);
  const title = document.querySelector('#title');
  const footer = title.querySelector('.title-footer');
  const over = () => footer.getBoundingClientRect().bottom + parseFloat(getComputedStyle(title).paddingBottom) - title.getBoundingClientRect().bottom;
  const apply = () => { style.textContent = layoutCSS(effective); };
  apply();
  const steps = [['levelHeight',52], ['sectionGap',10], ['buttonGap',12], ['upperHeight',48],
    ['levelHeight',44], ['sectionGap',4], ['upperHeight',44], ['buttonGap',8], ['logoOffset',0]];
  for (const [key, floor] of steps) {
    while (over() > .5 && effective[key] > floor) { effective[key]--; apply(); }
  }
  return effective;
}

export function installMenuLayout() {
  const style = document.createElement('style');
  style.id = 'approved-menu-layout';
  style.textContent = continuousMenuCSS;
  document.head.append(style);
}
