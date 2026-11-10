import { describe, expect, it } from 'vitest';
import { classifyScanGunKey, isEditableScanTarget, isPlausibleGunCode, normalizeGunCode } from './scanGun';

describe('USB 扫码枪按键解析', () => {
  it('只接管页面空白处的字母数字横线，输入框与组合键一律忽略', () => {
    expect(classifyScanGunKey({ key: 'A' }, null)).toBe('append');
    expect(classifyScanGunKey({ key: '-' }, null)).toBe('append');
    expect(classifyScanGunKey({ key: ' ' }, null)).toBe('ignore');
    expect(classifyScanGunKey({ key: 'A', ctrlKey: true }, null)).toBe('ignore');
    expect(classifyScanGunKey({ key: 'A' }, { tagName: 'INPUT' })).toBe('ignore');
    expect(classifyScanGunKey({ key: 'M' }, { tagName: 'textarea' })).toBe('ignore');
    expect(classifyScanGunKey({ key: 'M' }, { isContentEditable: true })).toBe('ignore');
  });

  it('回车提交，其它控制键忽略', () => {
    expect(classifyScanGunKey({ key: 'Enter' }, null)).toBe('submit');
    expect(classifyScanGunKey({ key: 'Enter' }, { tagName: 'INPUT' })).toBe('ignore');
    expect(classifyScanGunKey({ key: 'Shift' }, null)).toBe('ignore');
    expect(classifyScanGunKey({ key: 'Tab' }, null)).toBe('ignore');
  });

  it('扫码缓冲去掉杂字符并转大写，短码不提交', () => {
    expect(normalizeGunCode(' a001-1\n')).toBe('A001-1');
    expect(normalizeGunCode('a0 01-1')).toBe('A001-1');
    expect(isPlausibleGunCode('A1')).toBe(false);
    expect(isPlausibleGunCode('A001-1')).toBe(true);
  });

  it('内容可编辑区域也算输入中，不能被扫码枪接管', () => {
    expect(isEditableScanTarget({ tagName: 'div', isContentEditable: true })).toBe(true);
    expect(isEditableScanTarget({ tagName: 'DIV', isContentEditable: false })).toBe(false);
  });
});
