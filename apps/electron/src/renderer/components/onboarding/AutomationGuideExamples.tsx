import automationConfigurationExample from '@/assets/onboarding/guide-automation-configuration.png'
import automationExecutionExample from '@/assets/onboarding/guide-automation-execution.png'

/** 自动任务章节的真实工作流示例；由父页面负责放入章节容器和导航。 */
export function AutomationGuideExamples() {
  return (
    <>
      <div className="max-w-2xl">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-[#1b3f2d]">真实示例</div>
        <h2 className="mt-4 text-3xl font-light tracking-tight text-neutral-900 md:text-4xl">让每天的 PR 扫描自己按时运行</h2>
        <p className="mt-4 text-base leading-[1.7] text-neutral-600 md:text-lg">
          同一条每日 PR 扫描任务先在配置页落实为带频率、项目和模型的计划，再在每次触发时留下可回看的执行会话。
        </p>
      </div>

      <div className="mt-14 space-y-16 md:mt-16 md:space-y-20">
        <article className="grid gap-10 border-t border-[#1b3f2d]/15 pt-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
          <figure className="min-w-0 overflow-hidden rounded-lg bg-[#f6f8f3] shadow-[0_14px_30px_rgba(27,63,45,0.12)]">
            <img src={automationConfigurationExample} alt="每日扫描 Proma GitHub PR 的自动任务配置" className="block h-auto w-full" />
          </figure>
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-[#1b3f2d]">示例 01 · 配置</div>
            <h3 className="mt-3 text-2xl font-medium text-neutral-900 md:text-3xl">把每天的 PR 扫描排到固定时间</h3>
            <p className="mt-4 text-base leading-[1.7] text-neutral-600 md:text-lg">
              这条任务每天定点在 09:00 扫描 proma-ai/Proma 的 PR。配置页显示它已启用，并指定 Pi、DeepSeek V4 Flash 和“代码分析”项目；这里还能查看下次运行、历史记录，或先手动运行一次验证。
            </p>
            <div className="mt-5 border-l-2 border-[#1b3f2d]/35 pl-4">
              <div className="text-xs font-medium text-[#1b3f2d]">你可以这样说</div>
              <p className="mt-1 text-base leading-7 text-neutral-500">“每天早上扫描一下这个代码库的 PR，有没有什么有趣的新功能提交 https://github.com/proma-ai/Proma.git”</p>
            </div>
          </div>
        </article>

        <article className="grid gap-10 border-t border-[#1b3f2d]/15 pt-10 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-center">
          <div className="min-w-0 lg:order-1">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-[#1b3f2d]">示例 02 · 执行</div>
            <h3 className="mt-3 text-2xl font-medium text-neutral-900 md:text-3xl">每一次自动执行，都可以回到会话中复查</h3>
            <p className="mt-4 text-base leading-[1.7] text-neutral-600 md:text-lg">
              任务触发后，Proma 会留下带 PROMA_SCHEDULED_RUN 标记的执行会话。截图中 Agent 先检查此前的运行历史，发现多次认证失败，再读取上下文并调用 GitHub API 扫描 PR；工具调用、思考和结果都会保留在这段会话里。
            </p>
            <div className="mt-5 border-l-2 border-[#1b3f2d]/35 pl-4">
              <div className="text-xs font-medium text-[#1b3f2d]">你可以这样说</div>
              <p className="mt-1 text-base leading-7 text-neutral-500">“每天早上扫描这个仓库的 PR；如果上次运行失败，先检查原因，再告诉我这次有哪些值得关注的新功能提交。”</p>
            </div>
          </div>
          <figure className="min-w-0 overflow-hidden rounded-lg bg-[#f6f8f3] shadow-[0_14px_30px_rgba(27,63,45,0.12)] lg:order-2">
            <img src={automationExecutionExample} alt="自动任务触发 Agent 检查运行历史并扫描 GitHub PR 的执行会话" className="block h-auto w-full" />
          </figure>
        </article>
      </div>
    </>
  )
}
