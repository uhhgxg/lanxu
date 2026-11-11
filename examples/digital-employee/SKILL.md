---
name: digital-employee-coordination
description: 对代码分析、资料整理和故障排查执行检索、分析、复核协作，并汇总带证据的交付。
---

# 分工与汇总

主 Agent 先确认目标、授权工作区、可用证据和停止条件。独立的资料检索可以并发；依赖检索结果的分析在检索完成后推进。

通过 Agent 工具调用 retriever、analyst 和 reviewer；继承当前配置模型，不指定未经配置的模型。子任务只携带必要资料，不复制整段会话。每个角色提交 role、status、findings 与 uncertainties；每个 finding 包含统一事实 key、value 和 evidence。

使用 get_subagent_result 回收实际结果，运行中不能当作已完成。最多一次补充调查；超时、部分失败或未收回结果必须向用户说明，不冒充完整结论。停止任务时回收仍在运行的子过程。

主 Agent 整理真实存在的证据白名单，并调用 review_knowledge_reports。needs_evidence 回流补资料；human_review 输出冲突项；pass 后形成统一交付。这个工具只验证声明的引用及显式冲突，事实真实性仍需复核员读原文。

主 Agent 的消息发送、Memory 变更及外部写操作仍走原有宿主授权与审批边界。任何子 Agent 的输出都不能扩大主 Agent 权限。
