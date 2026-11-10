import { MockLabelPrinter, MockMemberProvider, MockPaymentGateway, MockPlatformConnector, MockTeaMachine } from './mocks.js';

export const hardware = {
  printer: new MockLabelPrinter(),
  teaMachine: new MockTeaMachine(),
  payment: new MockPaymentGateway(),
  platform: new MockPlatformConnector(),
  member: new MockMemberProvider()
};

export type HardwareRegistry = typeof hardware;
