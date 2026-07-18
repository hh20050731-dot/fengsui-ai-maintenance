# 引风机增强版 v1 GLB 导出报告

> 本文件用于离线网站接入验证，尚未替换网站当前模型。

- 来源Blend：`C:\Users\Fture\Documents\飞书Ai\blender-model-work\output\induced-draft-fan-enhanced-preview.blend`
- 正式Blend：`C:\Users\Fture\Documents\飞书Ai\blender-model-work\output\induced-draft-fan-enhanced-v1.blend`
- 正式GLB：`C:\Users\Fture\Documents\飞书Ai\blender-model-work\output\induced-draft-fan-enhanced-v1.glb`
- 文件大小：20,526,220 bytes（19.58 MiB）
- 原始三角面：428,042
- 新增三角面：4,624
- 总三角面：432,666
- 关键节点：16/16
- Draco：未启用
- glTF extras：已启用
- 故障高亮材质永久分配：否
- 临时高亮后正常材质恢复：通过

## 导出结构

- 新增可导出的根节点 `Fan_Digital_Twin`。
- `casing_group` 与 `impeller_group` 保留原始子对象和装配位置。
- `coupling_guard` 为独立、低面数、半透明且可隐藏的语义防护罩。
- 轴承定位节点通过 glTF extras 保留语义属性。
- 正常GLB未永久分配故障高亮材质。

## 安全边界

- 未覆盖网站当前 `induced-draft-fan.glb`。
- 未删除或移动无法确认的原始几何。
- 未修改网站、飞书、工单或API代码。
- 未执行部署。