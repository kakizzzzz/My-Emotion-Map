import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudSyncNotice } from '../../src/app/CloudSyncNotice';

const actions = {
  onSafeMerge: vi.fn(),
  onUseRemote: vi.fn(),
  onKeepLocal: vi.fn(),
  onDownloadRecovery: vi.fn(),
};

describe('cloud sync notice visibility', () => {
  afterEach(() => cleanup());

  it('keeps automatic checks quiet and shows user-operation sync', () => {
    const { rerender } = render(
      <CloudSyncNotice
        status="checking"
        isUserOperationSync={false}
        language="zh"
        {...actions}
      />,
    );

    expect(screen.queryByText('正在检查云端…')).toBeNull();

    rerender(
      <CloudSyncNotice
        status="syncing"
        isUserOperationSync
        language="zh"
        {...actions}
      />,
    );

    expect(screen.getByText('正在同步云端…')).toBeInTheDocument();
  });

  it('still shows an automatic sync problem that requires user action', () => {
    render(
      <CloudSyncNotice
        status="error"
        isUserOperationSync={false}
        errorInfo={{ kind: 'authorization', message: 'expired' }}
        language="zh"
        {...actions}
      />,
    );

    expect(screen.getByText(/云端权限已失效/)).toBeInTheDocument();
  });
});
