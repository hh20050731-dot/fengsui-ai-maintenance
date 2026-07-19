"""Generate competition-grade lightweight semantic equipment models.

This script creates distinct industrial assemblies with semantic, sensor and fault
nodes. Geometry is illustrative digital-twin content, not manufacturer-accurate CAD.
Run only with Blender's bundled Python.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
PUBLIC_MODELS = ROOT / "apps" / "web" / "public" / "models"
OUTPUT_ROOT = ROOT / "blender-model-work" / "output" / "equipment-library"
PREVIEW_ROOT = ROOT / "blender-model-work" / "previews" / "equipment-library"
REPORT_ROOT = ROOT / "blender-model-work" / "reports" / "equipment-library"
for folder in (PUBLIC_MODELS, OUTPUT_ROOT, PREVIEW_ROOT, REPORT_ROOT):
    folder.mkdir(parents=True, exist_ok=True)

LOD_SETTINGS = {
    "lod0": {"segments": 48, "detail": 1.0},
    "lod1": {"segments": 24, "detail": 0.65},
    "lod2": {"segments": 12, "detail": 0.35},
}

MODEL_SPECS = {
    "industrial-motor": {"label": "工业电机", "builder": "motor"},
    "bearing-assembly": {"label": "轴承组件", "builder": "bearing"},
    "flexible-coupling": {"label": "弹性联轴器", "builder": "coupling"},
    "feed-water-pump": {"label": "给水泵", "builder": "feed_pump"},
    "circulation-water-pump": {"label": "循环水泵", "builder": "circulation_pump"},
    "grate-gearbox": {"label": "炉排减速机", "builder": "gearbox"},
    "air-compressor": {"label": "空气压缩机", "builder": "compressor"},
    "leachate-pump": {"label": "渗滤液泵", "builder": "leachate_pump"},
}

MATERIALS = {
    "blue": ((0.035, 0.19, 0.34, 1), 0.32, 0.55),
    "steel": ((0.28, 0.36, 0.43, 1), 0.68, 0.3),
    "dark": ((0.045, 0.065, 0.085, 1), 0.42, 0.62),
    "guard": ((0.10, 0.18, 0.22, 1), 0.35, 0.38),
    "rubber": ((0.055, 0.07, 0.075, 1), 0.0, 0.9),
    "copper": ((0.42, 0.17, 0.055, 1), 0.52, 0.34),
    "sensor": ((0.02, 0.65, 0.83, 1), 0.18, 0.24),
    "fault": ((0.95, 0.20, 0.075, 1), 0.05, 0.3),
    "base": ((0.07, 0.11, 0.15, 1), 0.25, 0.74),
}


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            datablocks.remove(block)


def make_material(name: str):
    mat = bpy.data.materials.get(f"MAT_{name.upper()}")
    if mat:
        return mat
    color, metallic, roughness = MATERIALS[name]
    mat = bpy.data.materials.new(f"MAT_{name.upper()}")
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def set_material(obj, material: str):
    if obj.type == "MESH":
        obj.data.materials.clear()
        obj.data.materials.append(make_material(material))
    return obj


def semantic(obj, display: str, category: str, *, physical=True, fault_type=""):
    obj["display_name_zh"] = display
    obj["semantic_category"] = category
    obj["semantic_model"] = True
    obj["manufacturer_exact"] = False
    obj["physical_geometry"] = physical
    obj["purpose"] = "digital_twin_visualization"
    if fault_type:
        obj["fault_type"] = fault_type
    return obj


def add_empty(name: str, location=(0, 0, 0), parent=None, display="", category="group", fault_type=""):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = 0.13
    if parent:
        obj.parent = parent
    semantic(obj, display or name, category, physical=False, fault_type=fault_type)
    return obj


def finish_mesh(obj, name, material, parent=None, display="", category="component", fault_type="", bevel=0.04):
    obj.name = name
    if parent:
        obj.parent = parent
    set_material(obj, material)
    semantic(obj, display or name, category, fault_type=fault_type)
    if bevel > 0:
        modifier = obj.modifiers.new("edge_softening", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def box(name, location, scale, material, parent=None, display="", category="component", bevel=0.05, fault_type=""):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, name, material, parent, display, category, fault_type, bevel)


def cylinder(name, location, radius, depth, material, parent=None, rotation=(0, 0, 0), vertices=32, display="", category="component", fault_type="", bevel=0.025):
    bpy.ops.mesh.primitive_cylinder_add(vertices=max(8, vertices), radius=radius, depth=depth, location=location, rotation=rotation)
    return finish_mesh(bpy.context.object, name, material, parent, display, category, fault_type, bevel)


def torus(name, location, major_radius, minor_radius, material, parent=None, rotation=(0, 0, 0), segments=32, display="", category="component", fault_type=""):
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius, minor_radius=minor_radius, major_segments=max(8, segments), minor_segments=max(6, segments // 3), location=location, rotation=rotation)
    return finish_mesh(bpy.context.object, name, material, parent, display, category, fault_type, 0)


def uv_sphere(name, location, radius, material, parent=None, segments=24, scale=(1, 1, 1), display="", category="component", fault_type=""):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=max(12, segments), ring_count=max(6, segments // 2), radius=radius, location=location)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, name, material, parent, display, category, fault_type, 0.025)


def sensor(name, location, parent, display, fault_type):
    node = add_empty(name, location, parent, display, "sensor", fault_type)
    node["sensor_node"] = True
    node["semantic_locator"] = True
    return node


def fault_locator(name, location, parent, display, fault_type):
    node = add_empty(name, location, parent, display, "fault_locator", fault_type)
    node["fault_node"] = True
    node["semantic_locator"] = True
    return node


def base_frame(root, length=7.2, width=3.2):
    box("drive_base", (0, 0, -1.05), (length / 2, width / 2, 0.16), "base", root, "公共底座", "structural_frame", 0.04)
    for x in (-length / 2 + 0.35, length / 2 - 0.35):
        for y in (-width / 2 + 0.35, width / 2 - 0.35):
            cylinder(f"base_mount_{x}_{y}", (x, y, -1.25), 0.16, 0.35, "dark", root, vertices=16, display="地脚安装点", category="fastener")


def add_motor_assembly(root, x=-2.1, scale=1.0, seg=32, detail=1.0, prefix="motor"):
    motor_group = add_empty(f"{prefix}_group", (x, 0, 0), root, "工业电机总成", "assembly")
    cylinder(prefix, (x, 0, 0), 0.82 * scale, 2.35 * scale, "blue", motor_group, rotation=(0, math.pi / 2, 0), vertices=seg, display="工业电机", category="motor")
    cylinder(f"{prefix}_front_endcap", (x + 1.22 * scale, 0, 0), 0.72 * scale, 0.18 * scale, "steel", motor_group, rotation=(0, math.pi / 2, 0), vertices=seg, display="电机前端盖")
    cylinder(f"{prefix}_rear_endcap", (x - 1.22 * scale, 0, 0), 0.72 * scale, 0.18 * scale, "steel", motor_group, rotation=(0, math.pi / 2, 0), vertices=seg, display="电机后端盖")
    cylinder(f"{prefix}_shaft", (x + 1.53 * scale, 0, 0), 0.16 * scale, 0.72 * scale, "steel", motor_group, rotation=(0, math.pi / 2, 0), vertices=max(12, seg // 2), display="电机轴", category="shaft")
    box(f"{prefix}_terminal_box", (x - 0.15 * scale, 0, 0.94 * scale), (0.48 * scale, 0.48 * scale, 0.24 * scale), "dark", motor_group, "接线盒", "electrical", 0.05)
    box(f"{prefix}_foot_left", (x - 0.7 * scale, -0.48 * scale, -0.84 * scale), (0.43 * scale, 0.22 * scale, 0.12 * scale), "steel", motor_group, "电机底脚")
    box(f"{prefix}_foot_right", (x + 0.7 * scale, -0.48 * scale, -0.84 * scale), (0.43 * scale, 0.22 * scale, 0.12 * scale), "steel", motor_group, "电机底脚")
    if detail > 0.4:
        fin_count = 14 if detail > 0.8 else 8
        for index in range(fin_count):
            angle = 2 * math.pi * index / fin_count
            y, z = math.cos(angle) * 0.84 * scale, math.sin(angle) * 0.84 * scale
            box(f"{prefix}_cooling_fin_{index:02d}", (x, y, z), (0.92 * scale, 0.035 * scale, 0.10 * scale), "blue", motor_group, "散热筋", "cooling", 0.01)
    sensor(f"{prefix}_temperature_sensor", (x + 0.55 * scale, 0, 0.84 * scale), motor_group, "电机温度测点", "motor_overheat")
    sensor(f"{prefix}_vibration_sensor", (x + 0.9 * scale, -0.72 * scale, 0), motor_group, "电机振动测点", "motor_vibration")
    return motor_group


def add_coupling(root, x=0.0, seg=32, scale=1.0, guard=True):
    group = add_empty("coupling_group", (x, 0, 0), root, "联轴器总成", "assembly", "coupling_misalignment")
    cylinder("coupling_input", (x - 0.32 * scale, 0, 0), 0.38 * scale, 0.42 * scale, "steel", group, rotation=(0, math.pi / 2, 0), vertices=seg, display="输入半联轴器", category="coupling", fault_type="coupling_misalignment")
    cylinder("coupling_element", (x, 0, 0), 0.42 * scale, 0.25 * scale, "rubber", group, rotation=(0, math.pi / 2, 0), vertices=seg, display="弹性连接体", category="coupling", fault_type="coupling_misalignment")
    cylinder("coupling_output", (x + 0.32 * scale, 0, 0), 0.38 * scale, 0.42 * scale, "steel", group, rotation=(0, math.pi / 2, 0), vertices=seg, display="输出半联轴器", category="coupling", fault_type="coupling_misalignment")
    if guard:
        guard_obj = box("coupling_guard", (x, 0, 0.35 * scale), (0.72 * scale, 0.62 * scale, 0.55 * scale), "guard", group, "联轴器防护罩", "guard", 0.12)
        guard_obj["supports_visibility_toggle"] = True
        guard_obj["supports_transparency"] = True
    fault_locator("coupling_misalignment_locator", (x, 0, 0), group, "联轴器不对中定位", "coupling_misalignment")
    return group


def add_bearing_block(root, name, x, seg=32, scale=1.0):
    group = add_empty(f"{name}_group", (x, 0, 0), root, "轴承座总成", "assembly", "bearing_overheat")
    box(f"{name}_housing", (x, 0, -0.12 * scale), (0.55 * scale, 0.68 * scale, 0.63 * scale), "dark", group, "轴承座", "bearing", 0.16, "bearing_overheat")
    torus(f"{name}_outer_ring", (x, 0, 0), 0.39 * scale, 0.10 * scale, "steel", group, rotation=(0, math.pi / 2, 0), segments=seg, display="轴承外圈", category="bearing", fault_type="bearing_overheat")
    cylinder(f"{name}_shaft", (x, 0, 0), 0.18 * scale, 1.3 * scale, "steel", group, rotation=(0, math.pi / 2, 0), vertices=max(12, seg // 2), display="支撑轴", category="shaft")
    sensor(f"{name}_temperature_sensor", (x, 0, 0.72 * scale), group, "轴承温度测点", "bearing_overheat")
    sensor(f"{name}_vibration_sensor", (x, -0.65 * scale, 0.12 * scale), group, "轴承振动测点", "bearing_vibration")
    fault_locator(f"{name}_fault_locator", (x, 0, 0.15 * scale), group, "轴承故障定位", "bearing_overheat")
    return group


def build_motor(root, seg, detail):
    base_frame(root, 4.7, 2.6)
    add_motor_assembly(root, x=0, scale=1.0, seg=seg, detail=detail)
    add_empty("rotation_axis", (0, 0, 0), root, "旋转轴线", "axis")


def build_bearing(root, seg, detail):
    base_frame(root, 3.6, 2.4)
    add_bearing_block(root, "bearing_drive", 0, seg, 1.1)
    if detail > 0.5:
        for index, angle in enumerate((45, 135, 225, 315)):
            radians = math.radians(angle)
            cylinder(f"bearing_roller_{index:02d}", (0, math.cos(radians) * 0.39, math.sin(radians) * 0.39), 0.075, 0.28, "steel", root, rotation=(0, math.pi / 2, 0), vertices=max(8, seg // 3), display="简化滚动体", category="bearing")
    add_empty("rotation_axis", (0, 0, 0), root, "旋转轴线", "axis")


def build_coupling(root, seg, detail):
    base_frame(root, 4.1, 2.1)
    cylinder("input_shaft", (-1.35, 0, 0), 0.18, 1.7, "steel", root, rotation=(0, math.pi / 2, 0), vertices=seg, display="输入轴", category="shaft")
    add_coupling(root, 0, seg, 1.15, True)
    cylinder("output_shaft", (1.35, 0, 0), 0.18, 1.7, "steel", root, rotation=(0, math.pi / 2, 0), vertices=seg, display="输出轴", category="shaft")
    add_empty("rotation_axis", (0, 0, 0), root, "旋转轴线", "axis")


def add_pump_body(root, prefix, x=2.25, seg=32, multistage=False, vertical=False):
    group = add_empty(f"{prefix}_pump_group", (x, 0, 0), root, "泵体总成", "assembly")
    if vertical:
        cylinder(f"{prefix}_motor", (x, 0, 1.0), 0.68, 1.6, "blue", group, vertices=seg, display="立式泵电机", category="motor")
        cylinder(f"{prefix}_shaft", (x, 0, -0.1), 0.16, 1.5, "steel", group, vertices=max(12, seg // 2), display="泵轴", category="shaft")
        cylinder(f"{prefix}_impeller_housing", (x, 0, -0.88), 0.85, 0.55, "steel", group, vertices=seg, display="叶轮壳体", category="casing", fault_type="impeller_blockage")
        torus(f"{prefix}_volute", (x, 0, -0.88), 0.56, 0.18, "blue", group, segments=seg, display="蜗壳", category="casing")
    else:
        stage_count = 4 if multistage else 1
        for index in range(stage_count):
            stage_x = x + (index - (stage_count - 1) / 2) * 0.48
            cylinder(f"{prefix}_stage_{index + 1}", (stage_x, 0, 0), 0.78 - index * 0.03, 0.46, "blue" if index % 2 == 0 else "steel", group, rotation=(0, math.pi / 2, 0), vertices=seg, display=f"泵级{index + 1}", category="pump_stage", fault_type="cavitation")
        cylinder(f"{prefix}_shaft", (x, 0, 0), 0.15, 2.7, "steel", group, rotation=(0, math.pi / 2, 0), vertices=max(12, seg // 2), display="泵轴", category="shaft")
        if not multistage:
            torus(f"{prefix}_volute", (x, 0, 0), 0.62, 0.22, "blue", group, rotation=(0, math.pi / 2, 0), segments=seg, display="泵蜗壳", category="casing", fault_type="impeller_blockage")
    cylinder(f"{prefix}_inlet", (x, -1.05, -0.15), 0.28, 1.25, "steel", group, rotation=(math.pi / 2, 0, 0), vertices=seg, display="吸入口", category="pipe")
    cylinder(f"{prefix}_outlet", (x, 0, 1.02), 0.24, 0.85, "steel", group, vertices=seg, display="排出口", category="pipe")
    sensor(f"{prefix}_inlet_pressure_sensor", (x, -1.52, -0.15), group, "入口压力测点", "pressure_drop")
    sensor(f"{prefix}_outlet_pressure_sensor", (x, 0, 1.52), group, "出口压力测点", "pressure_drop")
    fault_locator(f"{prefix}_impeller_locator", (x, 0, -0.1 if not vertical else -0.88), group, "叶轮故障定位", "impeller_blockage")
    fault_locator(f"{prefix}_seal_locator", (x - 0.9, 0, 0), group, "机械密封定位", "seal_leakage")
    return group


def build_feed_pump(root, seg, detail):
    base_frame(root, 8.7, 3.2)
    add_motor_assembly(root, -2.8, 0.9, seg, detail)
    add_coupling(root, -0.8, seg, 0.8, True)
    add_bearing_block(root, "pump_drive_bearing", 0.15, seg, 0.72)
    add_pump_body(root, "feed_water", 2.25, seg, multistage=True)
    add_empty("rotation_axis", (0, 0, 0), root, "旋转轴线", "axis")


def build_circulation_pump(root, seg, detail):
    base_frame(root, 8.2, 3.4)
    add_motor_assembly(root, -2.5, 0.95, seg, detail)
    add_coupling(root, -0.45, seg, 0.85, True)
    add_pump_body(root, "circulation_water", 2.0, seg, multistage=False)
    add_empty("rotation_axis", (0, 0, 0), root, "旋转轴线", "axis")


def build_gearbox(root, seg, detail):
    base_frame(root, 6.8, 3.4)
    housing = box("gearbox_housing", (0.3, 0, 0.05), (2.05, 1.3, 1.15), "blue", root, "减速机箱体", "casing", 0.20, "lubrication_insufficient")
    housing["supports_transparency"] = True
    box("gearbox_top_cover", (0.3, 0, 1.22), (1.72, 1.05, 0.12), "steel", root, "检修上盖", "casing", 0.08)
    cylinder("gearbox_inspection_cover", (0.2, -1.33, 0.15), 0.62, 0.12, "steel", root, rotation=(math.pi / 2, 0, 0), vertices=seg, display="侧面检修盖", category="casing")
    cylinder("gearbox_breather", (0.95, 0, 1.55), 0.12, 0.42, "dark", root, vertices=max(12, seg // 2), display="呼吸器", category="lubrication")
    cylinder("gearbox_oil_sight", (1.35, -1.37, -0.25), 0.16, 0.08, "sensor", root, rotation=(math.pi / 2, 0, 0), vertices=max(12, seg // 2), display="油位观察窗", category="sensor", fault_type="lubrication_insufficient")
    rib_count = 7 if detail > 0.7 else 4 if detail > 0.4 else 2
    for index in range(rib_count):
        x = -1.25 + index * (3.1 / max(1, rib_count - 1))
        box(f"gearbox_cooling_rib_{index:02d}", (x, 1.34, 0.05), (0.055, 0.11, 0.86), "blue", root, "箱体散热筋", "cooling", 0.015)
    for index, (x, radius) in enumerate(((-0.8, 0.75), (0.45, 0.98), (1.35, 0.55))):
        cylinder(f"gear_{index + 1}", (x, 0, 0.08), radius, 0.34, "steel" if index != 1 else "copper", root, rotation=(math.pi / 2, 0, 0), vertices=seg, display=f"齿轮级{index + 1}", category="gear", fault_type="gear_wear")
        if detail > 0.5:
            teeth = max(8, int(seg * radius / 2))
            for tooth in range(teeth):
                angle = 2 * math.pi * tooth / teeth
                box(f"gear_{index + 1}_tooth_{tooth:02d}", (x + math.cos(angle) * (radius + 0.05), 0, 0.08 + math.sin(angle) * (radius + 0.05)), (0.08, 0.23, 0.05), "steel", root, "齿轮齿", "gear", 0.01)
    cylinder("gearbox_input_shaft", (-2.35, 0, 0.05), 0.18, 1.0, "steel", root, rotation=(0, math.pi / 2, 0), vertices=seg, display="输入轴", category="shaft")
    cylinder("gearbox_output_shaft", (2.75, 0, 0.05), 0.27, 1.0, "steel", root, rotation=(0, math.pi / 2, 0), vertices=seg, display="输出轴", category="shaft")
    sensor("gearbox_oil_temperature_sensor", (0.3, 0, 1.32), root, "润滑油温度测点", "lubrication_insufficient")
    sensor("gearbox_vibration_sensor", (1.45, -1.35, 0.1), root, "箱体振动测点", "gear_wear")
    fault_locator("gearbox_lubrication_locator", (0.3, 0, -0.55), root, "润滑不足定位", "lubrication_insufficient")


def build_compressor(root, seg, detail):
    base_frame(root, 9.0, 3.6)
    add_motor_assembly(root, -2.85, 0.88, seg, detail)
    add_coupling(root, -0.85, seg, 0.75, True)
    group = add_empty("compressor_group", (1.8, 0, 0), root, "螺杆压缩机总成", "assembly")
    for index, y in enumerate((-0.43, 0.43)):
        cylinder(f"screw_rotor_{index + 1}", (1.45, y, 0.15), 0.42, 2.6, "copper" if index == 0 else "steel", group, rotation=(0, math.pi / 2, 0), vertices=seg, display=f"螺杆转子{index + 1}", category="rotor", fault_type="discharge_pressure_abnormal")
    casing = box("compressor_casing", (1.45, 0, 0.15), (1.65, 1.1, 0.92), "blue", group, "压缩机壳体", "casing", 0.18)
    casing["supports_transparency"] = True
    box("compressor_service_cover", (1.45, -1.13, 0.18), (1.25, 0.08, 0.65), "steel", group, "检修盖板", "casing", 0.06)
    box("compressor_control_panel", (0.55, -1.24, 0.42), (0.42, 0.10, 0.31), "dark", group, "控制面板", "electrical", 0.04)
    box("compressor_display", (0.55, -1.35, 0.48), (0.22, 0.03, 0.12), "sensor", group, "运行显示屏", "sensor", 0.02)
    vent_count = 6 if detail > 0.7 else 4 if detail > 0.4 else 2
    for index in range(vent_count):
        box(f"compressor_vent_{index:02d}", (0.55 + index * 0.31, -1.225, -0.22), (0.10, 0.035, 0.05), "dark", group, "进气散热格栅", "cooling", 0.01)
    cylinder("compressor_inlet_filter", (0.15, 0.78, 1.02), 0.30, 0.68, "dark", group, vertices=seg, display="进气过滤器", category="filter")
    cylinder("oil_separator", (3.45, 0.9, 0.15), 0.48, 2.4, "steel", group, vertices=seg, display="油气分离器", category="separator")
    cylinder("compressor_discharge", (2.7, 0, 1.1), 0.22, 1.15, "steel", group, vertices=seg, display="排气管", category="pipe")
    torus("compressor_pipe_elbow", (2.7, 0.52, 1.66), 0.52, 0.10, "steel", group, rotation=(math.pi / 2, 0, 0), segments=seg, display="排气弯管", category="pipe")
    sensor("compressor_discharge_pressure_sensor", (2.7, 0, 1.72), group, "排气压力测点", "discharge_pressure_abnormal")
    sensor("compressor_temperature_sensor", (1.2, -1.05, 0.7), group, "主机温度测点", "compressor_overheat")
    fault_locator("compressor_pressure_fault_locator", (2.7, 0, 1.15), group, "排气压力异常定位", "discharge_pressure_abnormal")
    add_empty("rotation_axis", (0, 0, 0), root, "旋转轴线", "axis")


def build_leachate_pump(root, seg, detail):
    base_frame(root, 4.4, 3.6)
    group = add_pump_body(root, "leachate", 0, seg, vertical=True)
    cylinder("leachate_intake_cage", (0, 0, -1.55), 1.0, 0.75, "guard", group, vertices=seg, display="进水格栅", category="guard", fault_type="pump_blockage")
    fin_count = 10 if detail > 0.7 else 6 if detail > 0.4 else 4
    for index in range(fin_count):
        angle = 2 * math.pi * index / fin_count
        box(f"leachate_intake_bar_{index:02d}", (math.cos(angle) * 0.82, math.sin(angle) * 0.82, -1.55), (0.07, 0.07, 0.38), "steel", group, "进水格栅条", "guard", 0.01)
    sensor("leachate_current_sensor", (0, -0.72, 1.2), group, "电机电流测点", "pump_overload")
    fault_locator("leachate_blockage_locator", (0, 0, -1.55), group, "堵塞定位", "pump_blockage")


BUILDERS = {
    "motor": build_motor,
    "bearing": build_bearing,
    "coupling": build_coupling,
    "feed_pump": build_feed_pump,
    "circulation_pump": build_circulation_pump,
    "gearbox": build_gearbox,
    "compressor": build_compressor,
    "leachate_pump": build_leachate_pump,
}


def mesh_stats():
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    triangles = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    return len(meshes), triangles


def key_nodes():
    return [obj.name for obj in bpy.context.scene.objects if obj.get("semantic_model") or obj.get("sensor_node") or obj.get("fault_node")]


def export_glb(path: Path):
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=False,
        export_yup=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_apply=True,
    )


def setup_preview(label: str):
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    points = []
    for obj in meshes:
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    center = (minimum + maximum) / 2
    size = max(maximum - minimum)
    bpy.ops.object.camera_add(location=center + Vector((size * 1.15, -size * 1.45, size * 0.95)))
    camera = bpy.context.object
    camera.name = "PREVIEW_CAMERA"
    direction = center - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = size * 1.65
    bpy.context.scene.camera = camera
    for name, location, energy, size_light in (
        ("KEY", center + Vector((size, -size, size * 1.5)), 1400, size),
        ("FILL", center + Vector((-size, -size * 0.5, size)), 900, size),
        ("RIM", center + Vector((0, size, size * 1.4)), 1100, size),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size_light
        light = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.color = (0.004, 0.012, 0.022)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene["preview_label"] = label


def build_one(model_id: str, spec: dict, lod: str, setting: dict):
    reset_scene()
    root = add_empty(model_id.replace("-", "_") + "_root", (0, 0, 0), None, spec["label"], "equipment_root")
    root["model_id"] = model_id
    root["lod"] = lod
    root["data_boundary"] = "competition_demo_semantic_model_not_manufacturer_cad"
    BUILDERS[spec["builder"]](root, setting["segments"], setting["detail"])
    meshes, triangles = mesh_stats()
    nodes = key_nodes()
    model_dir = OUTPUT_ROOT / model_id
    model_dir.mkdir(parents=True, exist_ok=True)
    glb_path = PUBLIC_MODELS / f"{model_id}-{lod}.glb"
    export_glb(glb_path)
    if lod == "lod0":
        blend_path = model_dir / f"{model_id}.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
        setup_preview(spec["label"])
        preview_path = PREVIEW_ROOT / f"{model_id}.png"
        bpy.context.scene.render.filepath = str(preview_path)
        bpy.ops.render.render(write_still=True)
    mapping_path = model_dir / f"{model_id}-{lod}-node-mapping.json"
    mapping_path.write_text(json.dumps({"modelId": model_id, "label": spec["label"], "lod": lod, "meshCount": meshes, "triangleCount": triangles, "nodes": nodes}, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"lod": lod, "glb": str(glb_path.relative_to(ROOT)).replace("\\", "/"), "size": glb_path.stat().st_size, "meshCount": meshes, "triangleCount": triangles, "nodeCount": len(nodes)}


def main():
    selected = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(MODEL_SPECS)
    report = {"generatedBy": "Blender Python bpy", "blenderVersion": bpy.app.version_string, "dataBoundary": "Competition semantic digital-twin models; not manufacturer-accurate CAD.", "models": []}
    for model_id in selected:
        spec = MODEL_SPECS[model_id]
        lods = [build_one(model_id, spec, lod, setting) for lod, setting in LOD_SETTINGS.items()]
        report["models"].append({"modelId": model_id, "label": spec["label"], "blend": f"blender-model-work/output/equipment-library/{model_id}/{model_id}.blend", "preview": f"blender-model-work/previews/equipment-library/{model_id}.png", "lods": lods})
        print(f"[equipment-library] generated {model_id}: " + ", ".join(f"{row['lod']}={row['triangleCount']} tris" for row in lods), flush=True)
    (REPORT_ROOT / "equipment-library-validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# 设备模型库生成与验证报告", "", "> 所有模型均为比赛原型的轻量语义数字孪生，不是厂家精确CAD，不能用于制造、安装或安全校核。", "", f"Blender：{bpy.app.version_string}", "", "| 模型 | LOD0 | LOD1 | LOD2 | Blend | 预览 |", "|---|---:|---:|---:|---|---|"]
    for item in report["models"]:
        counts = {lod["lod"]: lod["triangleCount"] for lod in item["lods"]}
        lines.append(f"| {item['label']} | {counts['lod0']} | {counts['lod1']} | {counts['lod2']} | `{item['blend']}` | `{item['preview']}` |")
    (REPORT_ROOT / "equipment-library-validation.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
