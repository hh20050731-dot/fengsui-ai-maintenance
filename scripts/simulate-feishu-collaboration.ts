import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildHighRiskWorkOrderCard } from '../apps/server/src/providers/notification-provider.js';
import { createApp } from '../apps/server/src/app.js';

const notice = 'LOCAL SIMULATION — NOT REAL FEISHU CALLBACK';
const outputRoot = path.resolve(process.cwd(), 'artifacts/feishu');
const paths = {
  cards: path.join(outputRoot, 'cards'),
  callbacks: path.join(outputRoot, 'callbacks'),
  queries: path.join(outputRoot, 'query-results'),
  daily: path.join(outputRoot, 'daily-brief'),
};

await Promise.all(Object.values(paths).map((directory) => mkdir(directory, { recursive: true })));

async function writeJson(file: string, data: unknown) {
  await writeFile(file, `${JSON.stringify({ simulationNotice: notice, data }, null, 2)}\n`, 'utf8');
}

const { service, repository, callbackService, jobsService } = createApp({
  forceMock: true,
  verificationToken: 'LOCAL_SIMULATION_TOKEN_NOT_SECRET',
  cronSecret: 'LOCAL_SIMULATION_CRON_NOT_SECRET',
});

const created = await service.createWorkOrderFromAlert('ALT-20260717-001', {
  assignee: '张工',
  assigneeUserId: 'zhang-gong',
  idempotencyKey: 'local-simulation-create-work-order',
  digitalTwinContext: {
    equipmentName: '1号引风机', equipmentId: 'IDF-001', faultPart: '驱动端轴承', faultType: '轴承温升', riskLevel: '高',
    failureProbability: 89, healthScore: 42, temperature: 82, vibration: 5.2, speed: 1472, current: 41,
    diagnosis: '驱动端轴承存在润滑不足、磨损或冷却异常风险',
    advice: ['24小时内检查润滑油状态、轴承间隙、联轴器和地脚螺栓'],
    createdAt: new Date(Date.now() - 40 * 60_000).toISOString(),
  },
});

const initialCard = buildHighRiskWorkOrderCard(created, {
  temperature: 82, vibration: 5.2, healthScore: 42, failureProbability: 89, suggestedDeadline: '24小时内',
});
await writeJson(path.join(paths.cards, 'high-risk-work-order-card.json'), initialCard);

const callbackRequest = {
  schema: '2.0',
  header: { token: 'LOCAL_SIMULATION_TOKEN_NOT_SECRET', event_id: 'local-simulation-accept-001', event_type: 'card.action.trigger' },
  event: { action: { value: { action: 'accept_work_order', workOrderId: created.id, workOrderNo: created.workOrderNo } } },
};
await writeJson(path.join(paths.callbacks, 'accept-work-order-request.json'), callbackRequest);
const callbackResponse = await callbackService.handle(callbackRequest);
await writeJson(path.join(paths.callbacks, 'accept-work-order-response.json'), callbackResponse);
const accepted = await repository.getWorkOrder(created.id);
if (!accepted || accepted.status !== '已接单') throw new Error('Local simulation failed to accept work order');
await writeJson(path.join(paths.cards, 'accepted-work-order-card.json'), buildHighRiskWorkOrderCard(accepted));

const questions = [
  '当前风险最高的设备是什么？',
  '当前有哪些高风险设备？',
  '1号引风机当前状态如何？',
  '当前有哪些待处理工单？',
  '当前备件库存是否满足维修需求？',
  '哪台设备应该优先检修？',
  '为什么判断1号引风机存在轴承温升风险？',
];
const queryResults = [];
for (const [index, question] of questions.entries()) {
  const answer = await service.diagnose(undefined, question);
  queryResults.push(answer);
  await writeJson(path.join(paths.queries, `${String(index + 1).padStart(2, '0')}-${answer.intent}.json`), answer);
}

const reminderOrder = (await repository.listWorkOrders()).find((item) => item.status === '待接单');
if (!reminderOrder) throw new Error('Local simulation requires a pending work order');
await repository.updateWorkOrder(reminderOrder.id, {
  riskLevel: '高风险',
  createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
  createdTime: new Date(Date.now() - 60 * 60_000).toISOString(),
  deadline: new Date(Date.now() + 3 * 3_600_000).toISOString(),
});
const reminders = await jobsService.runWorkOrderReminders();
await writeJson(path.join(paths.cards, 'work-order-reminders.json'), reminders);
const daily = await jobsService.runDailyOperationsBrief();
await writeJson(path.join(paths.daily, 'daily-operations-brief.json'), daily);

const report = `# 飞书原生协同本地模拟报告

> ${notice}

## 模拟链路

1. 轴承温升场景创建高风险工单：${created.workOrderNo}。
2. 生成飞书高风险预警卡片 JSON，包含接单、3D 定位、工单详情和暂缓按钮。
3. 通过本地回调服务模拟“确认接单”，状态由待接单变为已接单。
4. 生成接单后的更新卡片 JSON。
5. 依次执行七类机器人查询，共得到 ${new Set(queryResults.map((item) => item.intent)).size} 个不同意图。
6. 模拟超过30分钟未接单与距时限不足4小时的规则型督办。
7. 生成每日运维简报及卡片预览。

## 真实性说明

- 本报告未调用真实飞书回调地址。
- 本报告未向真实飞书群发送消息。
- 本报告未读取或记录任何 App Secret、Verification Token、Encrypt Key 或真实 Token。
- 飞书真实联调仍需在开放平台配置机器人、权限、事件与回调，并由用户完成发布审批。
`;
await writeFile(path.join(outputRoot, 'local-simulation-report.md'), report, 'utf8');

console.log(`Generated local Feishu simulation artifacts at ${outputRoot}`);
