import { useEffect, useState } from 'react';
import type { Bootstrap, CodexModel } from '../shared/types';
import { request } from './lib';
import { SelectField } from './Controls';

export function ModelSettings({
  data,
  update,
  toast,
}: {
  data: Bootstrap;
  update: (data: Bootstrap) => void;
  toast: (message: string) => void;
}) {
  const [models, setModels] = useState<CodexModel[]>([]);
  const [catalog, setCatalog] = useState({
    globalModel: data.codex.globalModel,
    defaultModel: data.codex.defaultModel,
  });
  const [value, setValue] = useState(data.state.preferences.codexModel || '');
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
  return (
    <section className="panel settings-panel">
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
            onChange={(selected) =>
              setValue(selected === '@default' ? '' : selected === '@custom' ? '自定义模型' : selected)
            }
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
          disabled={loading || saving || value === current || value === '自定义模型'}
          onClick={async () => {
            setSaving(true);
            setError('');
            try {
              update(await request('/model', { model: value }));
              toast('模型已更新，将用于下一次请求');
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? '正在保存…' : value === current ? '已保存当前选择' : '保存模型选择'}
        </button>
      </div>
    </section>
  );
}
