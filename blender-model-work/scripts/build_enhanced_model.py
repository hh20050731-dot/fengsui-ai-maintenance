from __future__ import annotations

import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "input" / "induced-draft-fan.glb"
OUTPUT = ROOT / "output" / "induced-draft-fan-enhanced-preview.blend"
PREVIEW_DIR = ROOT / "previews" / "enhanced-model"
RAW_DIR = PREVIEW_DIR / "raw"
REPORT_DIR = ROOT / "reports"

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
RAW_DIR.mkdir(parents=True, exist_ok=True)
REPORT_DIR.mkdir(parents=True, exist_ok=True)

EXPECTED_OBJECTS = ["Cube", "SHELL"] + [f"SHELL{i:03d}" for i in range(1, 26)]
CASING_NAMES = ["SHELL", "SHELL002"]
IMPELLER_NAMES = ["SHELL001", "SHELL008"]
INTERNAL_NAMES = [name for name in EXPECTED_OBJECTS if name.startswith("SHELL") and name not in CASING_NAMES + IMPELLER_NAMES]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def clean_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def import_model() -> dict[str, bpy.types.Object]:
    bpy.ops.import_scene.gltf(filepath=str(INPUT))
    objects = {obj.name: obj for obj in bpy.context.scene.objects if obj.type == "MESH"}
    missing = [name for name in EXPECTED_OBJECTS if name not in objects]
    if missing:
        raise RuntimeError(f"输入模型缺少预期对象: {missing}")
    if len(objects) != 27:
        raise RuntimeError(f"预期27个Mesh，实际{len(objects)}个")
    return objects


def vec3(value: Vector | Iterable[float], digits: int = 6) -> list[float]:
    return [round(float(item), digits) for item in value]


def matrix_equal(left: Matrix, right: Matrix, tolerance: float = 1e-7) -> bool:
    return all(abs(float(left[row][column] - right[row][column])) <= tolerance for row in range(4) for column in range(4))


def mesh_triangle_count(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def world_bounds(objects: Iterable[bpy.types.Object]) -> tuple[Vector, Vector, Vector, float]:
    points = [obj.matrix_world @ Vector(corner) for obj in objects if obj.type == "MESH" for corner in obj.bound_box]
    if not points:
        raise RuntimeError("没有可用于取景的Mesh包围盒")
    minimum = Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points)))
    maximum = Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points)))
    center = (minimum + maximum) * 0.5
    radius = max((maximum - minimum).length * 0.5, 1.0)
    return minimum, maximum, center, radius


def compare_impeller_pair(left: bpy.types.Object, right: bpy.types.Object) -> dict[str, Any]:
    left_vertices = [tuple(round(float(component), 7) for component in vertex.co) for vertex in left.data.vertices]
    right_vertices = [tuple(round(float(component), 7) for component in vertex.co) for vertex in right.data.vertices]
    left_faces = [tuple(polygon.vertices) for polygon in left.data.polygons]
    right_faces = [tuple(polygon.vertices) for polygon in right.data.polygons]
    local_vertices_identical = left_vertices == right_vertices
    topology_identical = left_faces == right_faces
    transform_identical = matrix_equal(left.matrix_world, right.matrix_world)

    normal_dots: list[float] = []
    normals_same_direction = False
    normals_opposite_direction = False
    if len(left.data.polygons) == len(right.data.polygons):
        for left_polygon, right_polygon in zip(left.data.polygons, right.data.polygons):
            normal_dots.append(float(left_polygon.normal.dot(right_polygon.normal)))
        normals_same_direction = all(dot >= 0.999999 for dot in normal_dots)
        normals_opposite_direction = all(dot <= -0.999999 for dot in normal_dots)

    left_materials = [material.name for material in left.data.materials if material]
    right_materials = [material.name for material in right.data.materials if material]
    materials_identical = left_materials == right_materials
    complete_duplicate = all((local_vertices_identical, topology_identical, transform_identical, normals_same_direction, materials_identical))
    return {
        "left": left.name,
        "right": right.name,
        "vertexCount": [len(left_vertices), len(right_vertices)],
        "triangleCount": [mesh_triangle_count(left), mesh_triangle_count(right)],
        "localVertexCoordinatesIdentical": local_vertices_identical,
        "faceTopologyIdentical": topology_identical,
        "worldTransformIdentical": transform_identical,
        "normalDirectionsIdentical": normals_same_direction,
        "normalDirectionsOpposite": normals_opposite_direction,
        "minimumNormalDot": round(min(normal_dots), 7) if normal_dots else None,
        "materials": {left.name: left_materials, right.name: right_materials},
        "materialsIdentical": materials_identical,
        "completelyCoplanar": bool(local_vertices_identical and transform_identical),
        "innerOuterSurfacePair": False if complete_duplicate else None,
        "completeDuplicate": complete_duplicate,
        "objectsRetained": True,
        "conclusion": (
            "两对象顶点、面拓扑、世界变换、法线方向和材质完全一致；属于同位重复几何，不是可区分的叶轮内外表面。两个对象均保留并归入impeller_group。"
            if complete_duplicate
            else "两对象存在差异，当前不能认定为重复或内外表面；两个对象均保留并归入impeller_group。"
        ),
    }


def detect_impeller_axis(impellers: list[bpy.types.Object]) -> dict[str, Any]:
    # 两个候选目前是同位重复对象，只取第一个进行PCA，避免重复采样改变权重。
    source = impellers[0]
    points = np.array([tuple(source.matrix_world @ vertex.co) for vertex in source.data.vertices], dtype=np.float64)
    centroid = points.mean(axis=0)
    covariance = np.cov(points - centroid, rowvar=False)
    eigenvalues, eigenvectors = np.linalg.eigh(covariance)
    order = np.argsort(eigenvalues)
    eigenvalues = eigenvalues[order]
    eigenvectors = eigenvectors[:, order]
    direction = eigenvectors[:, 0]
    direction = direction / np.linalg.norm(direction)
    if direction[1] < 0:
        direction *= -1.0

    all_points = np.vstack([
        np.array([tuple(obj.matrix_world @ vertex.co) for vertex in obj.data.vertices], dtype=np.float64)
        for obj in impellers
    ])
    minimum = all_points.min(axis=0)
    maximum = all_points.max(axis=0)
    bbox_center = (minimum + maximum) * 0.5
    # 圆形外缘在X/Z方向对称；用包围盒中心锁定轴线穿过叶轮几何中心。
    origin = np.array((bbox_center[0], bbox_center[1], bbox_center[2]), dtype=np.float64)
    expected_y = np.array((0.0, 1.0, 0.0))
    angle_to_y = math.degrees(math.acos(float(np.clip(abs(direction.dot(expected_y)), -1.0, 1.0))))
    separation = float(eigenvalues[1] / max(eigenvalues[0], 1e-12))
    confidence = "high" if angle_to_y < 1.0 and separation > 1.15 else "medium" if angle_to_y < 5.0 else "low"
    return {
        "method": "PCA最小方差轴 + 叶轮包围盒中心复核",
        "sourceObjects": IMPELLER_NAMES,
        "origin": [round(float(value), 6) for value in origin],
        "direction": [round(float(value), 8) for value in direction],
        "principalVariances": [round(float(value), 6) for value in eigenvalues],
        "smallestToNextVarianceRatio": round(separation, 6),
        "angleToPositiveYDegrees": round(angle_to_y, 8),
        "confidence": confidence,
        "fallbackCandidatesRequired": confidence == "low",
    }


def new_collection(name: str, parent: bpy.types.Collection) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    parent.children.link(collection)
    return collection


def move_object(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def create_empty(name: str, collection: bpy.types.Collection, location: Vector) -> bpy.types.Object:
    empty = bpy.data.objects.new(name, None)
    collection.objects.link(empty)
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = 35.0
    empty.location = location
    return empty


def preserve_parent(obj: bpy.types.Object, parent: bpy.types.Object) -> None:
    matrix = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = matrix


def set_origin_to_axis(obj: bpy.types.Object, axis_origin: Vector) -> None:
    previous_cursor = bpy.context.scene.cursor.location.copy()
    bpy.context.scene.cursor.location = axis_origin
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR", center="MEDIAN")
    bpy.context.scene.cursor.location = previous_cursor


def make_material(
    name: str,
    color: tuple[float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.4,
    alpha: float = 1.0,
    emission: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, alpha)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF") if material.node_tree else None
    if shader:
        shader.inputs["Base Color"].default_value = (*color, 1.0)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        if "Alpha" in shader.inputs:
            shader.inputs["Alpha"].default_value = alpha
        if emission is not None:
            emission_input = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
            if emission_input:
                emission_input.default_value = (*emission, 1.0)
            strength_input = shader.inputs.get("Emission Strength")
            if strength_input:
                strength_input.default_value = emission_strength
    if alpha < 1.0:
        try:
            material.surface_render_method = "DITHERED"
        except Exception:
            try:
                material.blend_method = "BLEND"
                material.show_transparent_back = True
            except Exception:
                pass
    return material


def apply_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def link_created(obj: bpy.types.Object, collection: bpy.types.Collection) -> bpy.types.Object:
    move_object(obj, collection)
    return obj


def align_z_to_axis(obj: bpy.types.Object, axis: Vector) -> None:
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(axis.normalized())


def add_cube(name: str, location: Vector, dimensions: tuple[float, float, float], material: bpy.types.Material, collection: bpy.types.Collection) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_material(obj, material)
    return link_created(obj, collection)


def add_cylinder(
    name: str,
    location: Vector,
    radius: float,
    depth: float,
    axis: Vector,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    vertices: int = 32,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    align_z_to_axis(obj, axis)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_material(obj, material)
    return link_created(obj, collection)


def add_torus(
    name: str,
    location: Vector,
    major_radius: float,
    minor_radius: float,
    axis: Vector,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    major_segments: int = 32,
    minor_segments: int = 8,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    align_z_to_axis(obj, axis)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_material(obj, material)
    return link_created(obj, collection)


def join_objects(objects: list[bpy.types.Object], name: str, collection: bpy.types.Collection) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    result = bpy.context.object
    result.name = name
    move_object(result, collection)
    return result


def point_on_axis(origin: Vector, axis: Vector, distance: float) -> Vector:
    return origin + axis.normalized() * distance


def mark_semantic_model(obj: bpy.types.Object) -> None:
    obj["semantic_model"] = True
    obj["manufacturer_exact"] = False
    obj["purpose"] = "digital_twin_visualization"


def build_motor(axis_origin: Vector, axis: Vector, materials: dict[str, bpy.types.Material], collection: bpy.types.Collection) -> bpy.types.Object:
    center = point_on_axis(axis_origin, axis, 590.0)
    parts = [add_cylinder("__motor_body", center, 110.0, 300.0, axis, materials["MAT_MOTOR"], collection, 32)]
    parts.append(add_cylinder("__motor_front_cap", point_on_axis(axis_origin, axis, 435.0), 116.0, 18.0, axis, materials["MAT_MOTOR"], collection, 32))
    parts.append(add_cylinder("__motor_rear_cap", point_on_axis(axis_origin, axis, 745.0), 116.0, 18.0, axis, materials["MAT_MOTOR"], collection, 32))
    for index, y_distance in enumerate(np.linspace(460.0, 720.0, 11)):
        parts.append(add_cylinder(f"__motor_fin_{index:02d}", point_on_axis(axis_origin, axis, float(y_distance)), 121.0, 4.0, axis, materials["MAT_MOTOR"], collection, 32))
    # 两个低面数安装脚与电机壳体合并为一个语义对象。
    parts.append(add_cube("__motor_foot_left", Vector((-70.0, center.y, -146.0)), (72.0, 230.0, 72.0), materials["MAT_MOTOR"], collection))
    parts.append(add_cube("__motor_foot_right", Vector((70.0, center.y, -146.0)), (72.0, 230.0, 72.0), materials["MAT_MOTOR"], collection))
    motor = join_objects(parts, "motor", collection)
    mark_semantic_model(motor)
    motor["display_name_zh"] = "驱动电机（简化语义模型）"
    return motor


def build_bearing_housing(name: str, axis_origin: Vector, axis: Vector, distance: float, material: bpy.types.Material, collection: bpy.types.Collection) -> bpy.types.Object:
    center = point_on_axis(axis_origin, axis, distance)
    parts = [add_torus(f"__{name}_ring", center, 42.0, 16.0, axis, material, collection, 32, 8)]
    parts.append(add_cube(f"__{name}_pedestal", Vector((center.x, center.y, -119.0)), (112.0, 48.0, 126.0), material, collection))
    parts.append(add_cube(f"__{name}_cap", Vector((center.x, center.y, -52.0)), (122.0, 52.0, 18.0), material, collection))
    housing = join_objects(parts, name, collection)
    mark_semantic_model(housing)
    return housing


def build_drive_system(axis_report: dict[str, Any], materials: dict[str, bpy.types.Material], drive_collection: bpy.types.Collection, locator_collection: bpy.types.Collection) -> dict[str, bpy.types.Object]:
    axis_origin = Vector(axis_report["origin"])
    axis = Vector(axis_report["direction"]).normalized()
    created: dict[str, bpy.types.Object] = {}

    created["drive_base"] = add_cube("drive_base", Vector((0.0, 430.0, -200.0)), (420.0, 740.0, 36.0), materials["MAT_BASE"], drive_collection)
    mark_semantic_model(created["drive_base"])
    created["drive_base"]["display_name_zh"] = "传动系统底座（简化）"

    created["main_shaft"] = add_cylinder("main_shaft", point_on_axis(axis_origin, axis, 150.0), 18.0, 300.0, axis, materials["MAT_SHAFT"], drive_collection, 32)
    mark_semantic_model(created["main_shaft"])
    created["main_shaft"]["display_name_zh"] = "主轴（简化语义模型）"

    created["coupling_output"] = add_cylinder("coupling_output", point_on_axis(axis_origin, axis, 315.0), 48.0, 32.0, axis, materials["MAT_COUPLING"], drive_collection, 32)
    created["coupling_element"] = add_cylinder("coupling_element", point_on_axis(axis_origin, axis, 347.0), 39.0, 28.0, axis, materials["MAT_COUPLING"], drive_collection, 24)
    created["coupling_input"] = add_cylinder("coupling_input", point_on_axis(axis_origin, axis, 379.0), 48.0, 32.0, axis, materials["MAT_COUPLING"], drive_collection, 32)
    for name in ("coupling_output", "coupling_element", "coupling_input"):
        mark_semantic_model(created[name])
        created[name]["display_name_zh"] = "联轴器（简化语义模型）"

    created["motor_shaft"] = add_cylinder("motor_shaft", point_on_axis(axis_origin, axis, 413.0), 15.0, 70.0, axis, materials["MAT_SHAFT"], drive_collection, 24)
    mark_semantic_model(created["motor_shaft"])
    created["motor_shaft"]["display_name_zh"] = "电机轴（简化语义模型）"

    created["bearing_non_drive_housing"] = build_bearing_housing("bearing_non_drive_housing", axis_origin, axis, 145.0, materials["MAT_BEARING"], drive_collection)
    created["bearing_non_drive_housing"]["display_name_zh"] = "非驱动端轴承座（简化）"
    created["bearing_drive_housing"] = build_bearing_housing("bearing_drive_housing", axis_origin, axis, 230.0, materials["MAT_BEARING"], drive_collection)
    created["bearing_drive_housing"]["display_name_zh"] = "驱动端轴承座（简化）"

    created["motor"] = build_motor(axis_origin, axis, materials, drive_collection)

    locator_specs = (
        ("bearing_non_drive_locator", 145.0, "非驱动端轴承"),
        ("bearing_drive_locator", 230.0, "驱动端轴承"),
    )
    for name, distance, display_name in locator_specs:
        locator = add_torus(name, point_on_axis(axis_origin, axis, distance), 61.0, 4.0, axis, materials["MAT_FAULT_ORANGE"], locator_collection, 32, 8)
        locator["semantic_locator"] = True
        locator["physical_geometry"] = False
        locator["fault_type"] = "bearing_overheat"
        locator["display_name_zh"] = display_name
        locator.hide_render = True
        created[name] = locator

    axis_object = add_cylinder("rotation_axis", point_on_axis(axis_origin, axis, 270.0), 2.4, 1120.0, axis, materials["MAT_FAULT_RED"], locator_collection, 12)
    axis_object["semantic_locator"] = True
    axis_object["physical_geometry"] = False
    axis_object["semantic_id"] = "ROTATION_AXIS"
    axis_object["display_name_zh"] = "叶轮旋转轴线"
    axis_object.hide_render = True
    created["rotation_axis"] = axis_object
    return created


def create_materials() -> dict[str, bpy.types.Material]:
    return {
        "MAT_CASING": make_material("MAT_CASING", (0.10, 0.16, 0.22), metallic=0.35, roughness=0.42),
        "MAT_IMPELLER": make_material("MAT_IMPELLER", (0.56, 0.61, 0.66), metallic=0.75, roughness=0.24),
        "MAT_MOTOR": make_material("MAT_MOTOR", (0.07, 0.28, 0.47), metallic=0.45, roughness=0.36),
        "MAT_SHAFT": make_material("MAT_SHAFT", (0.36, 0.41, 0.46), metallic=0.9, roughness=0.18),
        "MAT_COUPLING": make_material("MAT_COUPLING", (0.23, 0.27, 0.31), metallic=0.8, roughness=0.25),
        "MAT_BEARING": make_material("MAT_BEARING", (0.15, 0.18, 0.21), metallic=0.62, roughness=0.32),
        "MAT_BASE": make_material("MAT_BASE", (0.12, 0.18, 0.22), metallic=0.42, roughness=0.5),
        "MAT_FAULT_ORANGE": make_material("MAT_FAULT_ORANGE", (1.0, 0.31, 0.04), metallic=0.1, roughness=0.28, alpha=0.72, emission=(1.0, 0.16, 0.01), emission_strength=2.0),
        "MAT_FAULT_RED": make_material("MAT_FAULT_RED", (0.92, 0.03, 0.035), metallic=0.05, roughness=0.24, alpha=0.86, emission=(1.0, 0.01, 0.01), emission_strength=2.8),
        "MAT_CASING_TRANSPARENT": make_material("MAT_CASING_TRANSPARENT", (0.11, 0.19, 0.26), metallic=0.2, roughness=0.4, alpha=0.18),
        "MAT_INTERNAL": make_material("MAT_INTERNAL", (0.24, 0.31, 0.36), metallic=0.45, roughness=0.42),
    }


def configure_hierarchy(objects: dict[str, bpy.types.Object], axis_origin: Vector) -> tuple[dict[str, bpy.types.Collection], dict[str, bpy.types.Object]]:
    root = bpy.data.collections.new("Fan_Digital_Twin")
    bpy.context.scene.collection.children.link(root)
    collections = {
        "root": root,
        "EXISTING_CASING": new_collection("EXISTING_CASING", root),
        "EXISTING_IMPELLER": new_collection("EXISTING_IMPELLER", root),
        "EXISTING_INTERNAL_PARTS": new_collection("EXISTING_INTERNAL_PARTS", root),
        "ADDED_DRIVE_SYSTEM": new_collection("ADDED_DRIVE_SYSTEM", root),
        "SEMANTIC_LOCATORS": new_collection("SEMANTIC_LOCATORS", root),
        "UNRESOLVED_PARTS": new_collection("UNRESOLVED_PARTS", root),
    }
    casing_group = create_empty("casing_group", collections["EXISTING_CASING"], Vector((0.0, 0.0, 0.0)))
    impeller_group = create_empty("impeller_group", collections["EXISTING_IMPELLER"], axis_origin)
    groups = {"casing_group": casing_group, "impeller_group": impeller_group}

    for name in CASING_NAMES:
        move_object(objects[name], collections["EXISTING_CASING"])
        preserve_parent(objects[name], casing_group)
    for name in IMPELLER_NAMES:
        set_origin_to_axis(objects[name], axis_origin)
        move_object(objects[name], collections["EXISTING_IMPELLER"])
        preserve_parent(objects[name], impeller_group)
    for name in INTERNAL_NAMES:
        move_object(objects[name], collections["EXISTING_INTERNAL_PARTS"])
    move_object(objects["Cube"], collections["UNRESOLVED_PARTS"])
    return collections, groups


def configure_render(center: Vector, radius: float, helper_collection: bpy.types.Collection) -> bpy.types.Object:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background") if scene.world.node_tree else None
    if background:
        background.inputs["Color"].default_value = (0.012, 0.022, 0.034, 1.0)
        background.inputs["Strength"].default_value = 0.5
    camera_data = bpy.data.cameras.new("EnhancedPreviewCamera")
    camera = bpy.data.objects.new("EnhancedPreviewCamera", camera_data)
    helper_collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.clip_start = max(radius * 0.001, 0.01)
    camera_data.clip_end = radius * 15.0
    scene.camera = camera
    for name, direction, energy in (
        ("EnhancedKey", (1.8, -1.4, 2.4), 2.8),
        ("EnhancedFill", (-1.5, -0.5, 1.1), 1.3),
        ("EnhancedRim", (0.4, 2.0, 1.8), 2.0),
    ):
        data = bpy.data.lights.new(name, type="SUN")
        data.energy = energy
        data.angle = math.radians(10.0)
        light = bpy.data.objects.new(name, data)
        helper_collection.objects.link(light)
        direction_vector = Vector(direction).normalized()
        light.location = center + direction_vector * radius * 3.0
        light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
    return camera


def position_camera(camera: bpy.types.Object, center: Vector, radius: float, direction: tuple[float, float, float], scale: float = 2.25) -> None:
    view = Vector(direction).normalized()
    camera.location = center + view * radius * 3.2
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = radius * scale
    camera.data.clip_start = max(radius * 0.001, 0.01)
    camera.data.clip_end = radius * 15.0
    bpy.context.view_layer.update()


def render(path: Path) -> None:
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def snapshot_materials(objects: Iterable[bpy.types.Object]) -> dict[str, tuple[list[bpy.types.Material | None], list[int]]]:
    result: dict[str, tuple[list[bpy.types.Material | None], list[int]]] = {}
    for obj in objects:
        if obj.type != "MESH":
            continue
        result[obj.name] = (list(obj.data.materials), [polygon.material_index for polygon in obj.data.polygons])
    return result


def restore_materials(objects: dict[str, bpy.types.Object], snapshot: dict[str, tuple[list[bpy.types.Material | None], list[int]]]) -> None:
    for name, (materials, indices) in snapshot.items():
        obj = objects.get(name)
        if not obj:
            continue
        obj.data.materials.clear()
        for material in materials:
            obj.data.materials.append(material)
        for polygon, material_index in zip(obj.data.polygons, indices):
            polygon.material_index = material_index


def set_visibility(all_meshes: Iterable[bpy.types.Object], visible_names: set[str]) -> None:
    for obj in all_meshes:
        obj.hide_render = obj.name not in visible_names


def render_previews(
    original_objects: dict[str, bpy.types.Object],
    added: dict[str, bpy.types.Object],
    materials: dict[str, bpy.types.Material],
    camera: bpy.types.Object,
) -> dict[str, Any]:
    all_meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and not obj.name.startswith("__")]
    object_map = {obj.name: obj for obj in all_meshes}
    original_names = set(original_objects)
    added_physical = {name for name, obj in added.items() if bool(obj.get("physical_geometry", True)) and name != "rotation_axis"}
    locator_names = {"bearing_drive_locator", "bearing_non_drive_locator", "rotation_axis"}
    all_physical = original_names | added_physical
    material_state = snapshot_materials(all_meshes)

    original_bounds = world_bounds(original_objects.values())
    enhanced_bounds = world_bounds([object_map[name] for name in all_physical])
    _, _, original_center, original_radius = original_bounds
    _, _, enhanced_center, enhanced_radius = enhanced_bounds
    _, _, drive_focus_center, drive_focus_radius = world_bounds(
        [original_objects[name] for name in IMPELLER_NAMES] + [object_map[name] for name in added_physical]
    )
    iso = (1.45, -1.75, 1.1)
    drive_focus_view = (1.8, 0.35, 0.9)

    set_visibility(all_meshes, original_names)
    position_camera(camera, original_center, original_radius, iso, 2.25)
    render(RAW_DIR / "01_original.png")

    set_visibility(all_meshes, all_physical)
    position_camera(camera, enhanced_center, enhanced_radius, iso, 2.25)
    render(RAW_DIR / "01_enhanced.png")
    render(PREVIEW_DIR / "02_full_assembly_isometric.png")

    for name in CASING_NAMES:
        apply_material(original_objects[name], materials["MAT_CASING_TRANSPARENT"])
    set_visibility(all_meshes, all_physical)
    position_camera(camera, enhanced_center, enhanced_radius, iso, 2.25)
    render(PREVIEW_DIR / "03_casing_transparent.png")
    restore_materials(object_map, material_state)

    for name in CASING_NAMES:
        apply_material(original_objects[name], materials["MAT_CASING_TRANSPARENT"])
    for name in IMPELLER_NAMES:
        apply_material(original_objects[name], materials["MAT_FAULT_ORANGE"])
    set_visibility(all_meshes, all_physical)
    position_camera(camera, enhanced_center, enhanced_radius, iso, 2.25)
    render(PREVIEW_DIR / "04_impeller_highlight.png")
    render(RAW_DIR / "fault_impeller.png")
    restore_materials(object_map, material_state)

    for name in CASING_NAMES:
        apply_material(original_objects[name], materials["MAT_CASING_TRANSPARENT"])
    apply_material(added["bearing_drive_housing"], materials["MAT_FAULT_ORANGE"])
    set_visibility(all_meshes, all_physical | {"bearing_drive_locator"})
    added["bearing_drive_locator"].hide_render = False
    position_camera(camera, drive_focus_center, drive_focus_radius, drive_focus_view, 2.15)
    render(PREVIEW_DIR / "05_drive_bearing_highlight.png")
    render(RAW_DIR / "fault_bearing.png")
    restore_materials(object_map, material_state)

    for name in CASING_NAMES:
        apply_material(original_objects[name], materials["MAT_CASING_TRANSPARENT"])
    for name in ("coupling_input", "coupling_element", "coupling_output", "main_shaft"):
        apply_material(added[name], materials["MAT_FAULT_ORANGE"])
    set_visibility(all_meshes, all_physical)
    position_camera(camera, drive_focus_center, drive_focus_radius, drive_focus_view, 2.15)
    render(PREVIEW_DIR / "06_coupling_shaft_highlight.png")
    restore_materials(object_map, material_state)

    set_visibility(all_meshes, added_physical)
    drive_objects = [object_map[name] for name in added_physical]
    _, _, drive_center, drive_radius = world_bounds(drive_objects)
    position_camera(camera, drive_center, drive_radius, (1.35, -1.8, 0.95), 2.35)
    render(PREVIEW_DIR / "07_drive_system_only.png")

    set_visibility(all_meshes, all_physical)
    position_camera(camera, enhanced_center, enhanced_radius, iso, 2.25)
    render(RAW_DIR / "fault_normal.png")
    for name in CASING_NAMES:
        apply_material(original_objects[name], materials["MAT_CASING_TRANSPARENT"])
    for name in ("coupling_input", "coupling_element", "coupling_output"):
        apply_material(added[name], materials["MAT_FAULT_RED"])
    set_visibility(all_meshes, all_physical | {"rotation_axis"})
    added["rotation_axis"].hide_render = False
    position_camera(camera, drive_focus_center, drive_focus_radius, drive_focus_view, 2.15)
    render(RAW_DIR / "fault_coupling.png")
    restore_materials(object_map, material_state)

    set_visibility(all_meshes, all_physical)
    position_camera(camera, enhanced_center, enhanced_radius, iso, 2.25)
    render(RAW_DIR / "09_hierarchy_base.png")

    for name in CASING_NAMES:
        apply_material(original_objects[name], materials["MAT_CASING_TRANSPARENT"])
    for name in ("main_shaft", "motor_shaft", "coupling_input", "coupling_element", "coupling_output"):
        apply_material(added[name], materials["MAT_FAULT_ORANGE"])
    set_visibility(all_meshes, all_physical | locator_names)
    for name in locator_names:
        added[name].hide_render = False
    position_camera(camera, enhanced_center, enhanced_radius, (1.0, -1.7, 0.65), 2.25)
    render(PREVIEW_DIR / "10_rotation_axis_validation.png")
    restore_materials(object_map, material_state)

    set_visibility(all_meshes, all_physical)
    return {
        "originalBounds": {"min": vec3(original_bounds[0]), "max": vec3(original_bounds[1])},
        "enhancedBounds": {"min": vec3(enhanced_bounds[0]), "max": vec3(enhanced_bounds[1])},
        "rawFaultPanels": ["fault_normal.png", "fault_impeller.png", "fault_bearing.png", "fault_coupling.png"],
    }


def bvh_for_object(obj: bpy.types.Object) -> BVHTree:
    obj.data.calc_loop_triangles()
    vertices = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    triangles = [tuple(triangle.vertices) for triangle in obj.data.loop_triangles]
    return BVHTree.FromPolygons(vertices, triangles, all_triangles=True, epsilon=0.0001)


def detect_casing_intersections(original_objects: dict[str, bpy.types.Object], added: dict[str, bpy.types.Object]) -> dict[str, Any]:
    casing_bvhs = {name: bvh_for_object(original_objects[name]) for name in CASING_NAMES}
    checks = []
    for name, obj in added.items():
        if obj.type != "MESH" or name.endswith("_locator") or name == "rotation_axis":
            continue
        obj_bvh = bvh_for_object(obj)
        for casing_name, casing_bvh in casing_bvhs.items():
            overlap_count = len(obj_bvh.overlap(casing_bvh))
            if overlap_count:
                checks.append({
                    "addedObject": name,
                    "existingObject": casing_name,
                    "triangleOverlapPairs": overlap_count,
                    "assessment": "轴系穿过叶轮/机壳中心的预期装配交界" if name == "main_shaft" else "需要人工检查的潜在穿插",
                })
    unexpected = [item for item in checks if item["addedObject"] != "main_shaft"]
    return {
        "method": "世界坐标BVH三角面相交检测",
        "detectedPairs": checks,
        "unexpectedPairs": unexpected,
        "unintendedSevereInterpenetration": bool(unexpected),
        "note": "轴、轴承孔、联轴器孔及底座接触属于设计装配关系；这里只把新增部件与现有机壳的非主轴相交列为潜在异常。",
    }


def node_mapping(original_objects: dict[str, bpy.types.Object], added: dict[str, bpy.types.Object], collections: dict[str, bpy.types.Collection]) -> dict[str, Any]:
    return {
        "root": "Fan_Digital_Twin",
        "collections": {
            "EXISTING_CASING": CASING_NAMES,
            "EXISTING_IMPELLER": IMPELLER_NAMES,
            "EXISTING_INTERNAL_PARTS": INTERNAL_NAMES,
            "ADDED_DRIVE_SYSTEM": [name for name in added if name not in {"bearing_drive_locator", "bearing_non_drive_locator", "rotation_axis"}],
            "SEMANTIC_LOCATORS": ["bearing_drive_locator", "bearing_non_drive_locator", "rotation_axis"],
            "UNRESOLVED_PARTS": ["Cube"],
        },
        "parents": {
            "casing_group": CASING_NAMES,
            "impeller_group": IMPELLER_NAMES,
        },
        "semanticObjects": {
            name: {
                "type": obj.type,
                "semanticModel": obj.get("semantic_model"),
                "semanticLocator": obj.get("semantic_locator"),
                "physicalGeometry": obj.get("physical_geometry", True),
                "manufacturerExact": obj.get("manufacturer_exact"),
                "purpose": obj.get("purpose"),
                "faultType": obj.get("fault_type"),
                "displayNameZh": obj.get("display_name_zh"),
            }
            for name, obj in added.items()
        },
        "safety": {
            "originalObjectsDeleted": False,
            "originalObjectsRenamed": False,
            "websiteModelModified": False,
            "formalGlbExported": False,
        },
    }


def write_reports(
    input_hash: str,
    pair: dict[str, Any],
    axis: dict[str, Any],
    original_objects: dict[str, bpy.types.Object],
    added: dict[str, bpy.types.Object],
    collections: dict[str, bpy.types.Collection],
    intersections: dict[str, Any],
    preview_details: dict[str, Any],
) -> dict[str, Any]:
    original_triangles = sum(mesh_triangle_count(obj) for obj in original_objects.values())
    added_physical_names = [name for name, obj in added.items() if obj.type == "MESH" and bool(obj.get("physical_geometry", True)) and name != "rotation_axis"]
    added_triangles = sum(mesh_triangle_count(added[name]) for name in added_physical_names)
    semantic_triangles = sum(mesh_triangle_count(obj) for name, obj in added.items() if name.endswith("_locator") or name == "rotation_axis")
    total_triangles = original_triangles + added_triangles + semantic_triangles

    alignment_objects = [
        "main_shaft", "motor_shaft", "coupling_input", "coupling_element", "coupling_output",
        "bearing_drive_housing", "bearing_non_drive_housing", "bearing_drive_locator", "bearing_non_drive_locator",
    ]
    alignments = [
        {
            "object": name,
            "targetAxisOrigin": axis["origin"],
            "targetAxisDirection": axis["direction"],
            "constructedOnDetectedAxis": True,
            "angularDeviationDegrees": 0.0,
        }
        for name in alignment_objects
    ]
    axis_document = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "inputSha256": input_hash,
        "rotationAxis": axis,
        "impellerOriginsMovedToAxisWithoutGeometryMovement": True,
        "alignments": alignments,
        "fallbackCandidateViewsGenerated": axis["fallbackCandidatesRequired"],
        "conclusion": "新增轴、联轴器、轴承座和电机轴均按检测轴线程序化创建并保持共轴。",
    }
    mapping = node_mapping(original_objects, added, collections)
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "analysisMode": "enhanced-preview-only",
        "input": {"path": str(INPUT), "sha256": input_hash},
        "outputBlend": str(OUTPUT),
        "impellerPair": pair,
        "rotationAxis": axis,
        "addedComponents": added_physical_names,
        "semanticLocators": ["bearing_drive_locator", "bearing_non_drive_locator", "rotation_axis"],
        "triangleCounts": {
            "original": original_triangles,
            "addedPhysicalGeometry": added_triangles,
            "semanticLocatorGeometry": semantic_triangles,
            "enhancedTotal": total_triangles,
            "addedUnder50000": added_triangles < 50000,
        },
        "intersections": intersections,
        "previews": preview_details,
        "limitations": [
            "增强部件是比赛原型所需的低面数语义几何，不代表厂家精确结构或尺寸。",
            "原模型没有可独立识别的motor、coupling、bearing、shaft实体。",
            "两个叶轮候选属于同位重复几何，本轮全部保留。",
            "未执行正式GLB导出，未替换网站模型。",
        ],
        "formalExportReadiness": {
            "geometryPrepared": True,
            "manualReviewRequired": True,
            "recommendedNextGate": "人工确认传动系统位于机壳外侧、轴承语义位置和重复叶轮保留策略后，才能进入正式GLB导出。",
        },
    }

    (REPORT_DIR / "impeller_pair_analysis.md").write_text(
        "\n".join([
            "# SHELL001 与 SHELL008 叶轮候选关系分析",
            "",
            "> 本报告只记录关系，不删除、合并或重命名任一对象。",
            "",
            f"- 顶点坐标完全一致：{'是' if pair['localVertexCoordinatesIdentical'] else '否'}",
            f"- 面拓扑完全一致：{'是' if pair['faceTopologyIdentical'] else '否'}",
            f"- 世界变换完全一致：{'是' if pair['worldTransformIdentical'] else '否'}",
            f"- 法线方向完全一致：{'是' if pair['normalDirectionsIdentical'] else '否'}",
            f"- 材质完全一致：{'是' if pair['materialsIdentical'] else '否'}",
            f"- 完全共面：{'是' if pair['completelyCoplanar'] else '否'}",
            f"- 是否为内外表面：{'否' if pair['innerOuterSurfacePair'] is False else '无法确认'}",
            f"- 是否为完全重复对象：{'是' if pair['completeDuplicate'] else '否'}",
            "",
            f"结论：{pair['conclusion']}",
        ]),
        encoding="utf-8",
    )
    (REPORT_DIR / "axis_alignment_report.md").write_text(
        "\n".join([
            "# 旋转轴线与增强部件共轴报告",
            "",
            f"- 检测方法：{axis['method']}",
            f"- 轴线原点：{axis['origin']}",
            f"- 轴线方向：{axis['direction']}",
            f"- 与世界Y轴夹角：{axis['angleToPositiveYDegrees']}°",
            f"- 自动检测置信度：{axis['confidence']}",
            f"- 是否需要多候选回退：{'是' if axis['fallbackCandidatesRequired'] else '否'}",
            "",
            "## 共轴部件",
            "",
            *[f"- {item['object']}：构建于检测轴线，角度偏差 {item['angularDeviationDegrees']}°" for item in alignments],
            "",
            "叶轮原点被移动到检测轴线上，但网格世界位置保持不变。",
        ]),
        encoding="utf-8",
    )
    (REPORT_DIR / "enhanced_node_mapping.json").write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8")
    (REPORT_DIR / "axis_alignment_report.json").write_text(json.dumps(axis_document, ensure_ascii=False, indent=2), encoding="utf-8")
    (REPORT_DIR / "enhanced_model_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (REPORT_DIR / "enhanced_model_report.md").write_text(
        "\n".join([
            "# 引风机轻量化语义数字孪生增强版报告",
            "",
            "> 第一轮只生成Blender分析版与预览；未导出正式GLB，未修改网站模型。",
            "",
            "## 叶轮与旋转轴",
            "",
            f"- SHELL001 / SHELL008：{pair['conclusion']}",
            f"- 旋转轴原点：{axis['origin']}",
            f"- 旋转轴方向：{axis['direction']}（与Y轴夹角 {axis['angleToPositiveYDegrees']}°）",
            "",
            "## 新增语义几何",
            "",
            *[f"- {name}" for name in added_physical_names],
            "",
            "## 三角面统计",
            "",
            f"- 原模型：{original_triangles:,}",
            f"- 新增实际语义几何：{added_triangles:,}",
            f"- 语义定位与轴线辅助几何：{semantic_triangles:,}",
            f"- 增强场景总计：{total_triangles:,}",
            f"- 新增实际几何是否小于50,000：{'是' if added_triangles < 50000 else '否'}",
            "",
            "## 穿插检查",
            "",
            f"- 检测方法：{intersections['method']}",
            f"- 是否存在非预期严重穿模：{'是' if intersections['unintendedSevereInterpenetration'] else '否'}",
            *[f"- {item['addedObject']} × {item['existingObject']}：{item['assessment']}（相交三角对 {item['triangleOverlapPairs']}）" for item in intersections['detectedPairs']],
            "",
            "## 适用性与限制",
            "",
            "- 可支持正常运行、叶轮不平衡、轴承温升、联轴器不对中的部件定位、高亮、剖视与动画联动原型。",
            "- 新增部件不代表厂家级机械复原，尺寸只保证视觉比例和拓扑关系合理。",
            "- 正式GLB导出前仍需人工确认传动系统布置、重复叶轮策略和语义节点位置。",
            "- 原模型、网站代码、工单和飞书功能均未修改。",
        ]),
        encoding="utf-8",
    )
    return report


def main() -> None:
    if not INPUT.exists():
        raise FileNotFoundError(INPUT)
    input_hash_before = sha256(INPUT)
    clean_scene()
    original_objects = import_model()
    pair = compare_impeller_pair(original_objects["SHELL001"], original_objects["SHELL008"])
    axis = detect_impeller_axis([original_objects[name] for name in IMPELLER_NAMES])
    axis_origin = Vector(axis["origin"])
    axis_direction = Vector(axis["direction"]).normalized()
    materials = create_materials()
    collections, groups = configure_hierarchy(original_objects, axis_origin)

    for name in CASING_NAMES:
        apply_material(original_objects[name], materials["MAT_CASING"])
    for name in IMPELLER_NAMES:
        apply_material(original_objects[name], materials["MAT_IMPELLER"])
    for name in INTERNAL_NAMES:
        apply_material(original_objects[name], materials["MAT_INTERNAL"])

    added = build_drive_system(axis, materials, collections["ADDED_DRIVE_SYSTEM"], collections["SEMANTIC_LOCATORS"])
    added["main_shaft"]["axis_origin"] = vec3(axis_origin)
    added["main_shaft"]["axis_direction"] = vec3(axis_direction)
    intersections = detect_casing_intersections(original_objects, added)

    helpers = new_collection("PREVIEW_HELPERS", collections["root"])
    all_physical = list(original_objects.values()) + [
        obj for name, obj in added.items() if name not in {"bearing_drive_locator", "bearing_non_drive_locator", "rotation_axis"}
    ]
    _, _, enhanced_center, enhanced_radius = world_bounds(all_physical)
    camera = configure_render(enhanced_center, enhanced_radius, helpers)

    # 保存正式预览场景前隐藏只用于语义高亮的定位环和轴线。
    for name in ("bearing_drive_locator", "bearing_non_drive_locator", "rotation_axis"):
        added[name].hide_render = True
    bpy.context.scene["analysis_only"] = True
    bpy.context.scene["formal_glb_exported"] = False
    bpy.context.scene["source_sha256"] = input_hash_before
    bpy.context.scene["rotation_axis_origin"] = vec3(axis_origin)
    bpy.context.scene["rotation_axis_direction"] = vec3(axis_direction)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), check_existing=False)

    preview_details = render_previews(original_objects, added, materials, camera)
    report = write_reports(input_hash_before, pair, axis, original_objects, added, collections, intersections, preview_details)
    input_hash_after = sha256(INPUT)
    if input_hash_before != input_hash_after:
        raise RuntimeError("输入GLB哈希发生变化，已停止")

    print(json.dumps({
        "status": "complete",
        "inputUnchanged": True,
        "inputSha256": input_hash_after,
        "impellerPairCompleteDuplicate": pair["completeDuplicate"],
        "axis": axis,
        "addedPhysicalTriangles": report["triangleCounts"]["addedPhysicalGeometry"],
        "semanticTriangles": report["triangleCounts"]["semanticLocatorGeometry"],
        "enhancedTotalTriangles": report["triangleCounts"]["enhancedTotal"],
        "unintendedSevereInterpenetration": intersections["unintendedSevereInterpenetration"],
        "outputBlend": str(OUTPUT),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ENHANCED_MODEL_ERROR: {exc}", file=sys.stderr)
        raise
