import { useEffect, useState } from 'react';
import type { Bootstrap, CodexModel, ReasoningEffort } from '../shared/types';
import { request } from './lib';
import { SelectField } from './Controls';

export function ModelSettings({
  data,
  update,
  toast,
  compact = false,
}: {
  data: Bootstrap;
  update: (data: Bootstrap) => void;
  toast: (message: string) => void;
  compact?: boolean;
}) {
  const [models, setModels] = useState<CodexModel[]>([]);
  const [catalog, setCatalog] = useState({
    globalModel: data.codex.globalModel,
    defaultModel: data.codex.defaultModel,
  });
  const [value, setValue] = useState(data.state.preferences.codexModel || '');
  const [effort, setEffort] = useState<ReasoningEffort | ''>(data.state.preferences.codexEffort || '');
  const [fast, setFast] = useState(data.state.preferences.codexFast || false);
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    request<{ models: CodexModel[]; globalModel?: string; defaultModel?: string }>(
      '/models',
      undefined,
      'GET',
      controller.signal,
    )
      .then((result) => {
        setModels(result.models);
        setCatalog({ globalModel: result.globalModel, defaultModel: result.defaultModel });
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  const current = data.state.preferences.codexModel || '';
  const display = current === '@global' ? catalog.globalModel : current || catalog.defaultModel;
  const selectedId = value === '@global' ? catalog.globalModel : value || catalog.defaultModel;
  const selected = models.find((m) => m.id === selectedId);
  const changed =
    value !== current ||
    effort !== (data.state.preferences.codexEffort || '') ||
    fast !== (data.state.preferences.codexFast || false);
  return (
    <section className={compact ? 'model-quick-settings' : 'panel settings-panel'}>
      <div className="section-heading">
        <h2>本机 Codex</h2>
        <span className="badge">{data.codex.authenticated ? '已登录' : '需要登录'}</span>
      </div>
      <p>
        当前模型：<strong>{display || 'CLI 默认（目录读取后显示）'}</strong>
        {current === '@global' && ' · 跟随全局模型'}
      </p>
      <p className="small muted">
        {data.codex.source} · {data.codex.version || '未找到 Codex CLI'}。使用现有登录和在线模型额度。
      </p>
      <div className="form-stack">
        <label>
          下一次请求使用的模型
          <SelectField
            label="Codex 模型"
            value={
              value === ''
                ? '@default'
                : value === '@global' || models.some((m) => m.id === value)
                  ? value
                  : '@custom'
            }
            onChange={(selected) => {
              setValue(selected === '@default' ? '' : selected === '@custom' ? '自定义模型' : selected);
              setEffort('');
              setFast(false);
            }}
            disabled={loading || saving}
            options={[
              {
                value: '@default',
                label: `CLI 默认${catalog.defaultModel ? ` · ${catalog.defaultModel}` : ''}`,
              },
              {
                value: '@global',
                label: `跟随全局模型${catalog.globalModel ? ` · ${catalog.globalModel}` : ' · 未配置'}`,
                disabled: !catalog.globalModel,
              },
              ...models.map((model) => ({
                value: model.id,
                label: model.name === model.id ? model.id : `${model.name} · ${model.id}`,
              })),
              { value: '@custom', label: '手动填写模型 ID' },
            ]}
          />
        </label>
        {value !== '' && value !== '@global' && !models.some((m) => m.id === value) && (
          <label>
            模型 ID
            <input
              value={value === '自定义模型' ? '' : value}
              placeholder="例如 gpt-6-astra"
              onChange={(e) => setValue(e.target.value || '自定义模型')}
              maxLength={120}
            />
          </label>
        )}
        <label>
          推理强度 · Effort
          <SelectField
            label="推理强度"
            value={effort || '@default'}
            disabled={loading || saving || !selected}
            onChange={(value) => setEffort(value === '@default' ? '' : (value as ReasoningEffort))}
            options={[
              {
                value: '@default',
                label: `模型默认${selected?.defaultEffort ? ` · ${selected.defaultEffort}` : ''}`,
              },
              ...(selected?.reasoningEfforts ?? []).map((value) => ({ value, label: value })),
            ]}
          />
        </label>
        <label className="fast-option">
          <input
            type="checkbox"
            checked={fast}
            disabled={loading || saving || !selected?.supportsFast}
            onChange={(e) => setFast(e.target.checked)}
          />
          Fast · 更快响应
        </label>
        <p className="small muted">
          Fast 可能消耗更多额度；可选强度和 Fast 支持来自本机模型目录。切换模型会重置为默认强度并关闭 Fast。
        </p>
        <p className="small muted">
          这里保存本工具的选择，不修改 Codex 全局配置。选择“跟随全局模型”后，每次请求读取全局模型名称。
          {loading
            ? '正在读取本机模型目录…'
            : '模型目录来自本机 CLI，也可手动填写模型 ID；可用性以实际请求为准。'}
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button
          className="outline-button"
          disabled={loading || saving || !changed || value === '自定义模型'}
          onClick={async () => {
            setSaving(true);
            setError('');
            try {
              update(await request('/model', { model: value, effort, fast }));
              toast('模型、推理强度和 Fast 已保存，将用于下一次请求');
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? '正在保存…' : !changed ? '已保存当前选择' : '保存请求设置'}
        </button>
      </div>
    </section>
  );
}
