import { crmConfig } from './crm.config';

const validEnv = {
  CRM_ENABLED: '1',
  CRM_BASE_URL: 'https://crm.example.com/',
  CRM_KEY_ID: 'teahour-prod',
  CRM_SECRET: '0123456789abcdef'
};

describe('crmConfig', () => {
  it('默认关闭：不配置任何 CRM 变量时返回 null（本地与未接入环境行为不变）', () => {
    expect(crmConfig({})).toBeNull();
    expect(crmConfig({ CRM_ENABLED: '0', CRM_BASE_URL: 'https://crm.example.com' })).toBeNull();
  });

  it('显式开启后去掉地址末尾斜杠并解析超时', () => {
    expect(crmConfig(validEnv)).toEqual({
      baseUrl: 'https://crm.example.com',
      keyId: 'teahour-prod',
      secret: '0123456789abcdef',
      timeoutMs: 3000
    });
    expect(crmConfig({ ...validEnv, CRM_TIMEOUT_MS: '800' })?.timeoutMs).toBe(800);
    // 越界值收敛到安全区间，避免一次误配把请求拖死或瞬间超时。
    expect(crmConfig({ ...validEnv, CRM_TIMEOUT_MS: '999999' })?.timeoutMs).toBe(15000);
    expect(crmConfig({ ...validEnv, CRM_TIMEOUT_MS: '1' })?.timeoutMs).toBe(300);
  });

  it('只给地址也能开启，减少漏写开关', () => {
    const config = crmConfig({
      CRM_BASE_URL: 'http://127.0.0.1:8899',
      CRM_KEY_ID: 'teahour-local',
      CRM_SECRET: '0123456789abcdef'
    });
    expect(config?.baseUrl).toBe('http://127.0.0.1:8899');
  });

  it('开启后缺地址、密钥或密钥过短必须启动即报错', () => {
    expect(() => crmConfig({ ...validEnv, CRM_BASE_URL: '' })).toThrow(/CRM_BASE_URL/);
    expect(() => crmConfig({ ...validEnv, CRM_BASE_URL: 'crm.example.com' })).toThrow(/http/);
    expect(() => crmConfig({ ...validEnv, CRM_KEY_ID: '' })).toThrow(/CRM_KEY_ID/);
    expect(() => crmConfig({ ...validEnv, CRM_SECRET: 'short' })).toThrow(/CRM_SECRET/);
  });

  it('生产环境拒绝明文 HTTP，本机回环地址除外', () => {
    expect(() =>
      crmConfig({ ...validEnv, NODE_ENV: 'production', CRM_BASE_URL: 'http://crm.example.com' })
    ).toThrow(/HTTPS/);
    expect(
      crmConfig({ ...validEnv, NODE_ENV: 'production', CRM_BASE_URL: 'http://127.0.0.1:8899' })
        ?.baseUrl
    ).toBe('http://127.0.0.1:8899');
  });
});
