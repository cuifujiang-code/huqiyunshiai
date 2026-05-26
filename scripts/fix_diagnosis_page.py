# -*- coding: utf-8 -*-
from pathlib import Path

jsx = r'''    <motionFallback />
'''

page = '''    <motionFallback />
'''

page = '''    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-blue-500/20 bg-slate-900/80 backdrop-blur-sm">
        <motionFallback />
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <motionFallback />
      </main>
    </motionFallback>
'''

# write properly
page = '''    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-blue-500/20 bg-slate-900/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo size="sm" />
          <button type="button" onClick={() => navigate('/student/dashboard')} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-blue-500/50">返回学习中心</button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        {notice && step === 'report' && (
          <p className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">{notice}</p>
        )}
        {step === 'input' && (
          <DiagnosisInputStep form={form} onChange={setForm} onSubmit={handleSubmit} loading={submitting} />
        )}
        {step === 'analyzing' && (
          <DiagnosisAnalyzingStep onComplete={handleAnalyzingComplete} durationMs={LOADING_MS} />
        )}
        {step === 'report' && report && (
          <DiagnosisReportView
            report={report}
            reportRef={reportRef}
            onExportPdf={handleExportPdf}
            onShare={handleShare}
            onBackHome={() => navigate('/student/dashboard')}
            exporting={exporting}
            planTasks={planTasks}
            onToggleTask={handleToggleTask}
          />
        )}
      </main>
    </div>'''

content = Path('src/pages/StudentDiagnosisPage.tsx').read_text(encoding='utf-8')
content = content.replace('<motionFallback />', page, 1)
Path('src/pages/StudentDiagnosisPage.tsx').write_text(content, encoding='utf-8')
print('done')
