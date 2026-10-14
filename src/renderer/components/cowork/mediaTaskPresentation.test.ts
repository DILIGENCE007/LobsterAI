import { expect, test } from 'vitest';

import { MediaBillingStatus, MediaDeliveryStatus, MediaTaskStatus } from '../../../shared/media/constants';
import type { CoworkMessage } from '../../types/cowork';
import { mediaTaskLabelKey } from './MediaTaskCard';
import { type AssistantTurnItem, consolidateMediaPolling } from './messageDisplayUtils';

const pendingPoll = (id: string): AssistantTurnItem => ({ type: 'tool_group', group: {
  type: 'tool_group',
  toolUse: { id, type: 'tool_use', timestamp: 1, content: '', metadata: {
    toolName: 'lobsterai_video_generate', toolUseId: id, toolInput: { action: 'status', taskId: '287' },
  } },
  toolResult: { id: `${id}-result`, type: 'tool_result', timestamp: 2, content: 'Status: processing', metadata: {
    toolUseId: id, toolResultDetails: { taskId: '287', status: MediaTaskStatus.Processing },
  } },
} });

const consolidate = (message: CoworkMessage) => consolidateMediaPolling([
  pendingPoll('one'), pendingPoll('two'), { type: 'system', message },
]).find(item => item.type === 'media_polling_group');

test('another completed media task cannot finish this task', () => {
  const item = consolidate({ id: 'complete', type: 'system', timestamp: 3,
    content: 'Video generation succeeded.\nTask ID: 2870\nSaved generated video: other.mp4',
    metadata: { toolResultDetails: { taskId: '2870', status: MediaTaskStatus.Succeeded } },
  });
  expect(item?.type === 'media_polling_group' && item.group.isComplete).toBe(false);
});

test('background timeout retains its failure status instead of showing success', () => {
  const item = consolidate({ id: 'complete', type: 'system', timestamp: 3,
    content: 'Video generation timed out.\nTask ID: 287',
    metadata: { toolResultDetails: { taskId: '287', status: MediaTaskStatus.Timeout, billingStatus: MediaBillingStatus.Refunded } },
  });
  expect(item?.type === 'media_polling_group' && item.group.isComplete).toBe(true);
  expect(item?.type === 'media_polling_group' && item.group.lastStatus).toBe(MediaTaskStatus.Timeout);
});

test('generated results still show delivery retry until a file is saved', () => {
  expect(mediaTaskLabelKey({ status: MediaTaskStatus.Succeeded, deliveryStatus: MediaDeliveryStatus.Retrying }))
    .toBe('mediaTaskDownloadRetry');
  expect(mediaTaskLabelKey({ status: MediaTaskStatus.Succeeded, deliveryStatus: MediaDeliveryStatus.Saved }))
    .toBe('mediaTaskSaved');
  expect(mediaTaskLabelKey({ status: MediaTaskStatus.Failed })).toBe('mediaTaskFailed');
});
