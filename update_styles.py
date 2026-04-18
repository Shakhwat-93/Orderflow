import re

task_board_css_path = r'src/pages/TaskBoard.css'
dash_board_css_path = r'src/pages/DashboardOverview.css'

with open(task_board_css_path, 'r', encoding='utf-8') as f:
    tb_content = f.read()

tb_root_replacement = """/* ================================================================
   ELITE TASK DASHBOARD — Eirokom Flat Matte Design
   Flat matte dark + crisp light mode
   ================================================================ */

:root {
  --elite-bg: #ffffff;
  --elite-surface: #ffffff;
  --elite-surface-hover: #f8fafc;
  --elite-text-pri: #0f172a;
  --elite-text-sec: #475569;
  --elite-text-ter: #94a3b8;
  --elite-border: rgba(0,0,0,0.07);
  
  /* Status Colors */
  --clr-teal: #22c55e;
  --clr-orange: #f97316;
  --clr-purple: #8b5cf6;
  --clr-mint: #f8fafc;
  --clr-indigo: #6366f1;
  
  --shadow-elite: 0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04);
  --shadow-hover: 0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04);
  --radius-elite: 16px;
}

[data-theme='dark'] {
  --elite-bg: #171717;
  --elite-surface: #1f1f1f;
  --elite-surface-hover: #252525;
  --elite-text-pri: #f0f0f0;
  --elite-text-sec: #a0a0a0;
  --elite-text-ter: #555555;
  --elite-border: rgba(255,255,255,0.06);
  --clr-mint: #252525;
  --shadow-elite: 0 2px 12px rgba(0,0,0,0.4), 0 8px 28px rgba(0,0,0,0.35);
  --shadow-hover: 0 4px 20px rgba(0,0,0,0.5);
}"""

pattern = r"/\* ================================================================\n   ELITE TASK DASHBOARD — Adobe Stock / Executive Aesthetics\n   ================================================================ \*/\n\n:root \{.*?\n\}\n\n\[data-theme='dark'\] \{.*?\n\}"
tb_content = re.sub(pattern, tb_root_replacement, tb_content, flags=re.DOTALL)

with open(task_board_css_path, 'w', encoding='utf-8') as f:
    f.write(tb_content)


with open(dash_board_css_path, 'r', encoding='utf-8') as f:
    db_content = f.read()

db_vars = """/* ================================================================
   DASHBOARD OVERVIEW — Eirokom Flat Matte Design
   Flat matte dark + crisp light mode
   ================================================================ */

:root {
  --dash-bg: #ffffff;
  --dash-card: #ffffff;
  --dash-card-hover: #f8fafc;
  --dash-border: rgba(0,0,0,0.07);
  --dash-border-row: rgba(0,0,0,0.05);
  --dash-text-pri: #0f172a;
  --dash-text-sec: #475569;
  --dash-text-ter: #94a3b8;
  --dash-accent: #6366f1;
  --dash-accent-bg: rgba(99,102,241,0.08);
  --dash-accent-border: rgba(99,102,241,0.15);
  --dash-btn-bg: #f1f5f9;
  --dash-btn-border: #e2e8f0;
  --dash-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04);
  --dash-shadow-hover: 0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04);
}

[data-theme='dark'] {
  --dash-bg: #171717;
  --dash-card: #1f1f1f;
  --dash-card-hover: #252525;
  --dash-border: rgba(255,255,255,0.06);
  --dash-border-row: rgba(255,255,255,0.04);
  --dash-text-pri: #f0f0f0;
  --dash-text-sec: #a0a0a0;
  --dash-text-ter: #555555;
  --dash-accent: #818cf8;
  --dash-accent-bg: rgba(129,140,248,0.1);
  --dash-accent-border: rgba(129,140,248,0.2);
  --dash-btn-bg: #2a2a2a;
  --dash-btn-border: rgba(255,255,255,0.08);
  --dash-shadow: 0 2px 12px rgba(0,0,0,0.4), 0 8px 28px rgba(0,0,0,0.35);
  --dash-shadow-hover: 0 4px 20px rgba(0,0,0,0.5);
}

"""

db_content = db_content.replace("/* ================================================================\n   DASHBOARD OVERVIEW — Elite Dual-Mode Desktop\n   ================================================================ */\n", db_vars)

db_content = db_content.replace("box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1) !important;", "box-shadow: var(--dash-shadow) !important;\n  background: var(--dash-card) !important;\n  border: 1px solid var(--dash-border) !important;")
db_content = db_content.replace(".metric-card.success-glow  { background: linear-gradient(135deg, #b832c7, #ed428e) !important; }", ".metric-card.success-glow  { border-bottom: 2px solid #ed428e !important; }")
db_content = db_content.replace(".metric-card.indigo-glow   { background: linear-gradient(135deg, #f96c14, #ed3f2b) !important; }", ".metric-card.indigo-glow   { border-bottom: 2px solid #f96c14 !important; }")
db_content = db_content.replace(".metric-card.teal-glow     { background: linear-gradient(135deg, #22c55e, #0d9488) !important; }", ".metric-card.teal-glow     { border-bottom: 2px solid #22c55e !important; }")
db_content = db_content.replace(".metric-card.neutral-glow  { background: linear-gradient(135deg, #06b6d4, #0284c7) !important; }", ".metric-card.neutral-glow  { border-bottom: 2px solid #06b6d4 !important; }")
db_content = db_content.replace(".metric-card.orange-glow   { background: linear-gradient(135deg, #0ea5e9, #3b82f6) !important; }", ".metric-card.orange-glow   { border-bottom: 2px solid #0ea5e9 !important; }")
db_content = db_content.replace(".metric-card.cyan-glow     { background: linear-gradient(135deg, #6366f1, #4f46e5) !important; }", ".metric-card.cyan-glow     { border-bottom: 2px solid #6366f1 !important; }")
db_content = db_content.replace(".metric-card.purple-glow   { background: linear-gradient(135deg, #a855f7, #8b5cf6) !important; }", ".metric-card.purple-glow   { border-bottom: 2px solid #a855f7 !important; }")
db_content = db_content.replace(".metric-card.warning-glow  { background: linear-gradient(135deg, #f59e0b, #ea580c) !important; }", ".metric-card.warning-glow  { border-bottom: 2px solid #f59e0b !important; }")
db_content = db_content.replace(".metric-card.danger-glow   { background: linear-gradient(135deg, #dc2626, #991b1b) !important; }", ".metric-card.danger-glow   { border-bottom: 2px solid #dc2626 !important; }")
db_content = db_content.replace(".metric-card.processing-glow { background: linear-gradient(135deg, #14b8a6, #047857) !important; }", ".metric-card.processing-glow { border-bottom: 2px solid #14b8a6 !important; }")

db_content = db_content.replace("color: rgba(255, 255, 255, 0.92) !important;", "color: var(--dash-text-sec) !important;")
db_content = db_content.replace("color: #fff !important;", "color: var(--dash-text-pri) !important;")

db_content = db_content.replace(".chart-card {\n  border-radius: var(--radius-xl) !important;\n  overflow: hidden;\n}", ".chart-card {\n  border-radius: 16px !important;\n  background: var(--dash-card);\n  border: 1px solid var(--dash-border);\n  box-shadow: var(--dash-shadow);\n  overflow: hidden;\n}")
db_content = db_content.replace(".ai-briefing-section {\n  border-radius: var(--radius-xl);\n  overflow: hidden;\n}", ".ai-briefing-section {\n  border-radius: 16px;\n  background: var(--dash-card);\n  border: 1px solid var(--dash-border);\n  box-shadow: var(--dash-shadow);\n  overflow: hidden;\n}")

db_content = db_content.replace("color: var(--text-primary);", "color: var(--dash-text-pri);")
db_content = db_content.replace("color: var(--text-secondary);", "color: var(--dash-text-sec);")

db_content = db_content.replace(
    ".welcome-banner-premium {\\n  background: linear-gradient(135deg, #6366f1 0%, #7c3aed 60%, #a855f7 100%);",
    ".welcome-banner-premium {\\n  background: var(--dash-card);\\n  border: 1px solid var(--dash-border);"
)
db_content = db_content.replace(
    ".welcome-banner-premium {\\n  background: linear-gradient(135deg, #6366f1 0%, #7c3aed 60%, #a855f7 100%);\\n  border-radius: var(--radius-xl);\\n  padding: var(--sp-8) var(--sp-10);\\n  color: #fff;",
    ".welcome-banner-premium {\\n  background: var(--dash-card);\\n  border-radius: 16px;\\n  border: 1px solid var(--dash-border);\\n  padding: var(--sp-8) var(--sp-10);\\n  color: var(--dash-text-pri);"
)

with open(dash_board_css_path, 'w', encoding='utf-8') as f:
    f.write(db_content)

print("CSS updated with Eirokom matte styles.")
