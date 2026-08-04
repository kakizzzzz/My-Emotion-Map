from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one replacement, found {count}')
    target.write_text(text.replace(old, new), encoding='utf-8')


replace_once(
    'src/App.tsx',
    "import { AppToast } from './app/AppToast';",
    "import { AppToast } from './app/AppToast';\nimport { CloudSyncNotice } from './app/CloudSyncNotice';",
)

replace_once(
    'src/App.tsx',
    "import { useCloudSync } from './services/useCloudSync';",
    "import { useCloudSync } from './services/useCloudSync';\nimport { prepareCloudSnapshot } from './services/cloudSnapshot';",
)

replace_once(
    'src/App.tsx',
    '''  const cloudSnapshot = useMemo(() => ({
    schemaVersion: initialData.schemaVersion,
    dataMode,
    moments,
    notes,
    conversations,
    followUps,
    revisits,
    themeTone,
    themePalette,
    lastViewport,
    lastConversationId: conversations.some(
      (conversation) => conversation.id === activeConversationId,
    )
      ? activeConversationId
      : undefined,
  }), [
    activeConversationId, conversations, dataMode, followUps,
    initialData.schemaVersion, moments, notes, revisits,
    themePalette, themeTone, lastViewport,
  ]);
  const chatUploadPaused = conversations.some((conversation) =>
    conversation.messages.some((message) => message.deliveryState === 'pending'),
  );
  const cloudSync = useCloudSync({
    client: cloudSession.client,
    session: workspaceReady ? cloudSession.session : null,
    snapshot: cloudSnapshot,
    applySnapshot,
    blockedByFutureSchema: workspaceUpgradeRequired,
    pauseUploads: chatUploadPaused,
  });''',
    '''  const workspaceSnapshot = useMemo(() => ({
    schemaVersion: initialData.schemaVersion,
    dataMode,
    moments,
    notes,
    conversations,
    followUps,
    revisits,
    themeTone,
    themePalette,
    lastViewport,
    lastConversationId: conversations.some(
      (conversation) => conversation.id === activeConversationId,
    )
      ? activeConversationId
      : undefined,
  }), [
    activeConversationId, conversations, dataMode, followUps,
    initialData.schemaVersion, moments, notes, revisits,
    themePalette, themeTone, lastViewport,
  ]);
  const hasPendingChatRequest = conversations.some((conversation) =>
    conversation.messages.some((message) => message.deliveryState === 'pending'),
  );
  const cloudSnapshot = useMemo(
    () => prepareCloudSnapshot(workspaceSnapshot),
    [workspaceSnapshot],
  );
  const cloudSync = useCloudSync({
    client: cloudSession.client,
    session: workspaceReady ? cloudSession.session : null,
    snapshot: cloudSnapshot,
    applySnapshot,
    blockedByFutureSchema: workspaceUpgradeRequired,
    pauseRemoteRefresh: hasPendingChatRequest,
  });''',
)

replace_once(
    'src/App.tsx',
    '''        <AppToast notice={toast} onDismiss={() => setToast(null)} />
        </main>''',
    '''        <CloudSyncNotice
          status={cloudSync.status}
          language={language}
          onUseRemote={cloudSync.useRemoteVersion}
          onKeepLocal={cloudSync.overwriteRemoteWithLocal}
        />
        <AppToast notice={toast} onDismiss={() => setToast(null)} />
        </main>''',
)

replace_once(
    'src/services/useCloudSync.ts',
    '''  blockedByFutureSchema = false,
  pauseUploads = false,
}: {
  client: SupabaseClient | null;
  session: Session | null;
  snapshot: AppDataSnapshot;
  applySnapshot: (snapshot: AppDataSnapshot) => void;
  blockedByFutureSchema?: boolean;
  pauseUploads?: boolean;
}) {''',
    '''  blockedByFutureSchema = false,
  pauseUploads = false,
  pauseRemoteRefresh = false,
}: {
  client: SupabaseClient | null;
  session: Session | null;
  snapshot: AppDataSnapshot;
  applySnapshot: (snapshot: AppDataSnapshot) => void;
  blockedByFutureSchema?: boolean;
  pauseUploads?: boolean;
  pauseRemoteRefresh?: boolean;
}) {''',
)

replace_once(
    'src/services/useCloudSync.ts',
    '''  const generationRef = useRef(0);
  const pendingAppliedHashRef = useRef('');
  const [instanceId] = useState(requestId);''',
    '''  const generationRef = useRef(0);
  const pendingAppliedHashRef = useRef('');
  const statusRef = useRef(status);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const [instanceId] = useState(requestId);''',
)

replace_once(
    'src/services/useCloudSync.ts',
    '''  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    applySnapshotRef.current = applySnapshot;
  }, [applySnapshot]);''',
    '''  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    applySnapshotRef.current = applySnapshot;
  }, [applySnapshot]);''',
)

replace_once(
    'src/services/useCloudSync.ts',
    '''  const acceptRemote = useCallback((
    userId: string,
    remote: AppDataSnapshot,
    remoteRevision: number,
  ) => {
    const digest = canonicalSnapshotDigest(remote);
    persistMeta(userId, markSyncComplete({ revision: remoteRevision, payloadHash: digest }));
    setUploadedSnapshot(digest);
    pendingAppliedHashRef.current = digest;
    window.localStorage.setItem(`my-emotion-map.cloud-revision.${userId}`, String(remoteRevision));
    applySnapshotRef.current(remote);
    setRevision(remoteRevision);
    setStatus('synced');
  }, [persistMeta]);

  useEffect(() => {''',
    '''  const acceptRemote = useCallback((
    userId: string,
    remote: AppDataSnapshot,
    remoteRevision: number,
  ) => {
    const digest = canonicalSnapshotDigest(remote);
    persistMeta(userId, markSyncComplete({ revision: remoteRevision, payloadHash: digest }));
    setUploadedSnapshot(digest);
    pendingAppliedHashRef.current = digest;
    window.localStorage.setItem(`my-emotion-map.cloud-revision.${userId}`, String(remoteRevision));
    applySnapshotRef.current(remote);
    setRevision(remoteRevision);
    setStatus('synced');
  }, [persistMeta]);

  const refreshRemote = useCallback(async () => {
    const userId = session?.user.id;
    if (
      !client ||
      !userId ||
      blockedByFutureSchema ||
      pauseRemoteRefresh ||
      snapshotRef.current.dataMode !== 'real' ||
      refreshInFlightRef.current ||
      statusRef.current === 'checking' ||
      statusRef.current === 'syncing' ||
      statusRef.current === 'conflict' ||
      statusRef.current === 'upgrade_required'
    ) {
      return;
    }
    const now = Date.now();
    if (now - lastRefreshAtRef.current < 1_200) return;
    lastRefreshAtRef.current = now;
    refreshInFlightRef.current = true;
    const requestGeneration = generationRef.current;
    setStatus('checking');

    try {
      const { data, error } = await client
        .from('app_states')
        .select('revision,payload')
        .eq('user_id', userId)
        .maybeSingle();
      if (
        generationRef.current !== requestGeneration ||
        activeUserRef.current !== userId
      ) {
        return;
      }
      if (error) {
        setStatus(navigator.onLine ? 'error' : 'offline');
        return;
      }
      if (!data) {
        setStatus((syncMetaRef.current?.baseRevision ?? 0) === 0
          ? 'synced'
          : 'error');
        return;
      }

      const remoteResult = safeSnapshot(data.payload);
      const remoteRevision = Number(data.revision);
      if (remoteResult.status === 'upgrade_required') {
        setRevision(
          Number.isSafeInteger(remoteRevision) && remoteRevision >= 1
            ? remoteRevision
            : null,
        );
        setStatus('upgrade_required');
        return;
      }
      if (
        remoteResult.status !== 'ok' ||
        !Number.isSafeInteger(remoteRevision) ||
        remoteRevision < 1
      ) {
        setStatus('error');
        return;
      }

      const currentMeta = syncMetaRef.current ?? loadSyncMeta(userId);
      if (currentMeta && remoteRevision < currentMeta.baseRevision) {
        setStatus('synced');
        return;
      }
      const local = snapshotRef.current;
      const localHash = canonicalSnapshotDigest(local);
      const remote = remoteResult.snapshot;
      const remoteHash = canonicalSnapshotDigest(remote);
      const classification = classifyBroadcast({
        localHash,
        incomingHash: remoteHash,
        meta: currentMeta,
      });

      if (classification === 'ignore') {
        persistMeta(
          userId,
          markSyncComplete({
            revision: remoteRevision,
            payloadHash: remoteHash,
          }),
        );
        setUploadedSnapshot(remoteHash);
        window.localStorage.setItem(
          `my-emotion-map.cloud-revision.${userId}`,
          String(remoteRevision),
        );
        setRevision(remoteRevision);
        setStatus('synced');
        return;
      }
      if (classification === 'fetch_remote') {
        acceptRemote(userId, remote, remoteRevision);
        return;
      }

      saveRecoveryCopies(userId, local, remote);
      conflictRemoteRef.current = {
        snapshot: remote,
        revision: remoteRevision,
      };
      if (currentMeta) {
        persistMeta(userId, { ...currentMeta, dirty: true });
      }
      setRevision(remoteRevision);
      setStatus('conflict');
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [
    acceptRemote,
    blockedByFutureSchema,
    client,
    pauseRemoteRefresh,
    persistMeta,
    session?.user.id,
  ]);

  useEffect(() => {''',
)

replace_once(
    'src/services/useCloudSync.ts',
    '''  }, [acceptRemote, blockedByFutureSchema, client, persistMeta, session?.user.id]);

  useEffect(() => {
    if (!client) {''',
    '''  }, [acceptRemote, blockedByFutureSchema, client, persistMeta, session?.user.id]);

  useEffect(() => {
    if (
      !client ||
      !session ||
      blockedByFutureSchema ||
      pauseRemoteRefresh
    ) {
      return;
    }
    const recheck = () => {
      if (document.visibilityState === 'hidden') return;
      void refreshRemote();
    };
    window.addEventListener('focus', recheck);
    window.addEventListener('pageshow', recheck);
    window.addEventListener('online', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      window.removeEventListener('pageshow', recheck);
      window.removeEventListener('online', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [
    blockedByFutureSchema,
    client,
    pauseRemoteRefresh,
    refreshRemote,
    session,
  ]);

  useEffect(() => {
    if (!client) {''',
)

replace_once(
    'src/services/useCloudSync.ts',
    '''  useEffect(() => {
    if (!client || !session || status !== 'offline' || revision === null || snapshot.dataMode !== 'real') return;
    const resume = () => setStatus('synced');
    window.addEventListener('online', resume);
    return () => window.removeEventListener('online', resume);
  }, [client, revision, session, snapshot.dataMode, status]);

''',
    '',
)

replace_once(
    'src/app/appDataRepository.ts',
    '''    deliveryState:
      source.deliveryState === 'pending' ||
      source.deliveryState === 'delivered' ||
      source.deliveryState === 'failed' ||
      source.deliveryState === 'stopped'
        ? source.deliveryState
        : undefined,''',
    '''    deliveryState:
      source.deliveryState === 'pending'
        ? 'stopped'
        : source.deliveryState === 'delivered' ||
            source.deliveryState === 'failed' ||
            source.deliveryState === 'stopped'
          ? source.deliveryState
          : undefined,''',
)

replace_once(
    'src/styles/feedback.css',
    '''.toast button {
  min-height: 36px;
  padding: 0 10px;
  border-radius: var(--em-radius-pill);
  background: rgba(255, 255, 255, 0.2);
  color: white;
  font-weight: 800;
  text-decoration: underline;
}

/* Location permission */''',
    '''.toast button {
  min-height: 36px;
  padding: 0 10px;
  border-radius: var(--em-radius-pill);
  background: rgba(255, 255, 255, 0.2);
  color: white;
  font-weight: 800;
  text-decoration: underline;
}

.cloud-sync-toast {
  bottom: calc(env(safe-area-inset-bottom) + 10.5rem);
  flex-wrap: wrap;
}

.cloud-sync-toast--conflict {
  max-width: min(22rem, calc(100% - 32px));
  padding: 10px 12px;
  border-radius: 18px;
  pointer-events: auto;
}

.cloud-sync-toast__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  width: 100%;
}

.cloud-sync-toast__actions button {
  min-height: 32px;
  padding: 0 10px;
  text-decoration: none;
}

/* Location permission */''',
)
