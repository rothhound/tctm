import { Test, TestingModule } from '@nestjs/testing';
import { PromptsController } from './prompts.controller';
import { PromptsService } from './prompts.service';

describe('PromptsController', () => {
  let controller: PromptsController;
  let promptsService: Partial<PromptsService>;

  const mockVersions = [
    { id: 'pv-2', purpose: 'extract', version: 2, content: 'v2 content', active: true },
    { id: 'pv-1', purpose: 'extract', version: 1, content: 'v1 content', active: false },
  ];

  const mockActivePrompt = mockVersions[0];

  const mockCreatedVersion = {
    id: 'pv-3',
    purpose: 'extract',
    version: 3,
    content: 'new content',
    active: false,
    metadata: { createdBy: 'manual', reason: 'testing' },
  };

  const mockActivatedVersion = { ...mockVersions[1], active: true };

  beforeEach(async () => {
    promptsService = {
      listVersions: jest.fn().mockResolvedValue(mockVersions),
      getActivePrompt: jest.fn().mockResolvedValue(mockActivePrompt),
      createVersion: jest.fn().mockResolvedValue(mockCreatedVersion),
      activate: jest.fn().mockResolvedValue(mockActivatedVersion),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromptsController],
      providers: [{ provide: PromptsService, useValue: promptsService }],
    }).compile();

    controller = module.get<PromptsController>(PromptsController);
  });

  describe('list()', () => {
    it('returns versions for a purpose', async () => {
      const result = await controller.list('extract');
      expect(promptsService.listVersions).toHaveBeenCalledWith('extract');
      expect(result).toEqual(mockVersions);
    });

    it('passes different purposes through', async () => {
      await controller.list('judge');
      expect(promptsService.listVersions).toHaveBeenCalledWith('judge');
    });
  });

  describe('getActive()', () => {
    it('returns the active prompt for a purpose', async () => {
      const result = await controller.getActive('extract');
      expect(promptsService.getActivePrompt).toHaveBeenCalledWith('extract');
      expect(result).toEqual(mockActivePrompt);
    });

    it('passes different purposes through', async () => {
      await controller.getActive('snooze');
      expect(promptsService.getActivePrompt).toHaveBeenCalledWith('snooze');
    });
  });

  describe('create()', () => {
    it('creates a new version with metadata', async () => {
      const body = {
        purpose: 'extract' as const,
        content: 'new content',
        metadata: { createdBy: 'admin', reason: 'testing' },
      };
      const result = await controller.create(body);
      expect(promptsService.createVersion).toHaveBeenCalledWith(
        'extract',
        'new content',
        { createdBy: 'admin', reason: 'testing' },
      );
      expect(result).toEqual(mockCreatedVersion);
    });

    it('defaults createdBy to manual when metadata is missing', async () => {
      const body = {
        purpose: 'judge' as const,
        content: 'judge prompt',
      };
      await controller.create(body);
      expect(promptsService.createVersion).toHaveBeenCalledWith(
        'judge',
        'judge prompt',
        { createdBy: 'manual', reason: undefined },
      );
    });

    it('defaults createdBy to manual when metadata.createdBy is missing', async () => {
      const body = {
        purpose: 'resolve' as const,
        content: 'resolve prompt',
        metadata: { reason: 'calibration' },
      };
      await controller.create(body);
      expect(promptsService.createVersion).toHaveBeenCalledWith(
        'resolve',
        'resolve prompt',
        { createdBy: 'manual', reason: 'calibration' },
      );
    });
  });

  describe('activate()', () => {
    it('activates a prompt version by id', async () => {
      const result = await controller.activate('pv-1');
      expect(promptsService.activate).toHaveBeenCalledWith('pv-1');
      expect(result).toEqual(mockActivatedVersion);
    });
  });
});
