jest.mock('../../src/models', () => ({
  sequelize: { transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }) },
  Template: {
    count: jest.fn(),
    create: jest.fn()
  }
}));

const { Template } = require('../../src/models');
const templateService = require('../../src/services/templateService');

describe('TemplateService.initializeDefaultTemplates', () => {
  afterEach(() => jest.clearAllMocks());

  test('creates defaults when none exist', async () => {
    Template.count.mockResolvedValue(0);
    Template.create.mockResolvedValue(true);

    const res = await templateService.initializeDefaultTemplates();
    expect(res).toBe(true);
    expect(Template.create).toHaveBeenCalled();
  });

  test('does nothing when templates already exist', async () => {
    Template.count.mockResolvedValue(5);
    const res = await templateService.initializeDefaultTemplates();
    expect(res).toBe(true);
    expect(Template.create).not.toHaveBeenCalled();
  });
});
