import type { ApiSettings, Settings } from "../lib/types";
import type { Language } from "../lib/i18n";

type SettingsPanelProps = {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  apiSettings: ApiSettings;
  onApiSettingsChange: (settings: ApiSettings) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: (key: string) => string;
};

const SettingsPanel = ({
  settings,
  onSettingsChange,
  apiSettings,
  onApiSettingsChange,
  language,
  onLanguageChange,
  t
}: SettingsPanelProps) => {
  return (
    <div className="panel compact">
      <div className="panel-header">
        <h2>{t("settings.title")}</h2>
      </div>
      <div className="panel-body">
        <div className="section">
          <h3>{t("settings.workingHours")}</h3>
          <div className="field-grid">
            <label className="field">
              <span>{t("settings.start")}</span>
              <input
                type="time"
                value={settings.workDayStart}
                onChange={(event) => onSettingsChange({ ...settings, workDayStart: event.target.value })}
              />
            </label>
            <label className="field">
              <span>{t("settings.end")}</span>
              <input
                type="time"
                value={settings.workDayEnd}
                onChange={(event) => onSettingsChange({ ...settings, workDayEnd: event.target.value })}
              />
            </label>
          </div>
          <div className="field-grid">
            <label className="field">
              <span>{t("settings.lunchStart")}</span>
              <input
                type="time"
                value={settings.lunchStart}
                onChange={(event) => onSettingsChange({ ...settings, lunchStart: event.target.value })}
              />
            </label>
            <label className="field">
              <span>{t("settings.lunchEnd")}</span>
              <input
                type="time"
                value={settings.lunchEnd}
                onChange={(event) => onSettingsChange({ ...settings, lunchEnd: event.target.value })}
              />
            </label>
          </div>
          <div className="field-grid">
            <label className="field">
              <span>{t("settings.horizon")}</span>
              <input
                type="number"
                min={3}
                value={settings.planningHorizonDays}
                onChange={(event) =>
                  onSettingsChange({ ...settings, planningHorizonDays: Number(event.target.value) })
                }
              />
            </label>
            <label className="field">
              <span>{t("settings.maxDaily")}</span>
              <input
                type="number"
                min={60}
                value={settings.maxDailyMinutes}
                onChange={(event) => onSettingsChange({ ...settings, maxDailyMinutes: Number(event.target.value) })}
              />
            </label>
          </div>
          <label className="field">
            <span>{t("settings.timezone")}</span>
            <input
              value={settings.timezone}
              onChange={(event) => onSettingsChange({ ...settings, timezone: event.target.value })}
            />
          </label>
          <label className="field">
            <span>{t("settings.language")}</span>
            <select value={language} onChange={(event) => onLanguageChange(event.target.value as Language)}>
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <div className="section">
          <h3>{t("settings.aiTitle")}</h3>
          <div className="field-grid">
            <label className="field">
              <span>{t("settings.provider")}</span>
              <select
                value={apiSettings.provider}
                onChange={(event) =>
                  onApiSettingsChange({ ...apiSettings, provider: event.target.value as ApiSettings["provider"] })
                }
              >
                <option value="openai">{t("settings.providerOpenAI")}</option>
                <option value="anthropic">{t("settings.providerAnthropic")}</option>
              </select>
            </label>
            <label className="field">
              <span>{t("settings.model")}</span>
              <input
                value={apiSettings.model}
                onChange={(event) => onApiSettingsChange({ ...apiSettings, model: event.target.value })}
              />
            </label>
          </div>
          <label className="field">
            <span>{t("settings.baseUrl")}</span>
            <input
              value={apiSettings.baseUrl}
              onChange={(event) => onApiSettingsChange({ ...apiSettings, baseUrl: event.target.value })}
            />
          </label>
          <label className="field">
            <span>{t("settings.apiKey")}</span>
            <input
              type="password"
              value={apiSettings.apiKey}
              onChange={(event) => onApiSettingsChange({ ...apiSettings, apiKey: event.target.value })}
            />
          </label>
          <label className="field">
            <span>{t("settings.systemPrompt")}</span>
            <textarea
              className="settings-textarea"
              value={apiSettings.taskSystemPrompt}
              onChange={(event) => onApiSettingsChange({ ...apiSettings, taskSystemPrompt: event.target.value })}
            />
            <div className="hint">{t("settings.systemPromptHint")}</div>
          </label>
          <div className="hint">{t("settings.hint")}</div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
