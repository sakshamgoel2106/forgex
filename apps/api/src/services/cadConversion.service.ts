// @ts-ignore
import occtimportjs from 'occt-import-js';
import { buildGlbFromParts, isValidGlbHeader, type GlbPartDefinition } from '../utils/glbBuilder.js';
import { logger } from '../utils/logger.js';

let occtInstance: any = null;

async function getOcct(): Promise<any> {
  if (!occtInstance) {
    const factory = typeof occtimportjs === 'function' ? occtimportjs : (occtimportjs as any).default;
    occtInstance = await factory();
    logger.info('OpenCASCADE (occt-import-js) WebAssembly CAD runtime initialized');
  }
  return occtInstance;
}

export interface CadConversionResult {
  success: boolean;
  glbBuffer?: Buffer;
  partsCount?: number;
  vertexCount?: number;
  error?: string;
}

export class CadConversionService {
  /**
   * Checks if the format is a standard STEP CAD format.
   */
  public isStepFormat(format: string): boolean {
    const normalized = (format || '').trim().toUpperCase();
    return normalized === 'STEP' || normalized === 'STP';
  }

  /**
   * Checks if the format is a Boundary Representation (B-Rep) format requiring conversion to GLB.
   */
  public isBrepFormat(format: string): boolean {
    const normalized = (format || '').trim().toUpperCase();
    return ['STEP', 'STP', 'IGES', 'IGS', 'BREP'].includes(normalized);
  }

  /**
   * Converts a genuine STEP ISO 10303-21 CAD file buffer into a viewable glTF 2.0 binary (.glb) model.
   * Extracts verified assembly parts, geometry vertices, normals, and element indices.
   */
  public async convertStepToGlb(
    buffer: Buffer,
    assemblyName = 'Industrial Machine Assembly'
  ): Promise<CadConversionResult> {
    if (!buffer || buffer.length === 0) {
      return {
        success: false,
        error: 'CAD conversion failed: STEP source file is empty (0 bytes).',
      };
    }

    try {
      const occt = await getOcct();
      const startTime = Date.now();

      // Parse B-Rep solids and produce tessellated triangle meshes
      const result = occt.ReadStepFile(buffer, null);

      if (!result || !result.success || !result.meshes || result.meshes.length === 0) {
        logger.warn({ assemblyName }, 'occt.ReadStepFile returned 0 renderable meshes');
        return {
          success: false,
          error: 'CAD conversion failed: STEP file contains no renderable solid bodies or face geometries.',
        };
      }

      const parts: GlbPartDefinition[] = [];
      let totalVertices = 0;

      for (let i = 0; i < result.meshes.length; i++) {
        const mesh = result.meshes[i];
        if (!mesh.attributes?.position?.array || mesh.attributes.position.array.length === 0) {
          continue;
        }

        const partName = mesh.name && mesh.name.trim() !== '' ? mesh.name : `Component_${i + 1}`;
        const positions = Array.from(mesh.attributes.position.array as Float32Array | number[]);
        const normals = mesh.attributes.normal?.array
          ? Array.from(mesh.attributes.normal.array as Float32Array | number[])
          : this.computeFlatNormals(positions, mesh.index?.array ? Array.from(mesh.index.array) : []);
        const indices = mesh.index?.array
          ? Array.from(mesh.index.array as Uint16Array | Uint32Array | number[])
          : Array.from({ length: positions.length / 3 }, (_, idx) => idx);

        totalVertices += positions.length / 3;

        parts.push({
          name: partName,
          title: partName,
          data: {
            positions,
            normals,
            indices,
          },
        });
      }

      if (parts.length === 0) {
        return {
          success: false,
          error: 'CAD conversion failed: No valid vertex positions found in STEP assembly.',
        };
      }

      const glbBuffer = buildGlbFromParts(parts, assemblyName);

      if (!isValidGlbHeader(glbBuffer)) {
        return {
          success: false,
          error: 'CAD conversion failed: Generated GLB buffer failed binary glTF header verification.',
        };
      }

      const durationMs = Date.now() - startTime;
      logger.info(
        {
          assemblyName,
          partsCount: parts.length,
          vertexCount: totalVertices,
          glbSizeBytes: glbBuffer.length,
          durationMs,
        },
        'STEP-to-GLB CAD conversion completed successfully'
      );

      return {
        success: true,
        glbBuffer,
        partsCount: parts.length,
        vertexCount: totalVertices,
      };
    } catch (err: any) {
      logger.error({ err: err?.message, assemblyName }, 'Exception during STEP-to-GLB conversion');
      return {
        success: false,
        error: `CAD conversion exception: ${err?.message || 'Unknown parser error'}`,
      };
    }
  }

  /**
   * Computes face normals if not provided by the STEP tessellation
   */
  private computeFlatNormals(positions: number[], indices: number[]): number[] {
    const normals = new Array(positions.length).fill(0);

    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i] * 3;
      const i1 = indices[i + 1] * 3;
      const i2 = indices[i + 2] * 3;

      const ax = positions[i1] - positions[i0];
      const ay = positions[i1 + 1] - positions[i0 + 1];
      const az = positions[i1 + 2] - positions[i0 + 2];

      const bx = positions[i2] - positions[i0];
      const by = positions[i2 + 1] - positions[i0 + 1];
      const bz = positions[i2 + 2] - positions[i0 + 2];

      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;

      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

      for (const idx of [i0, i1, i2]) {
        normals[idx] = nx / len;
        normals[idx + 1] = ny / len;
        normals[idx + 2] = nz / len;
      }
    }

    return normals;
  }
}

export const cadConversionService = new CadConversionService();
