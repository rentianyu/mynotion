import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { SubpageBlockSpec } from "./subpage.tsx";
import { DatabaseBlockSpec } from "./database.tsx";

// subpage(P3) + database(P5)。createReactBlockSpec 返回工厂函数，注册必须带 ()。
export const appSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, subpage: SubpageBlockSpec(), database: DatabaseBlockSpec() },
});

export type AppBlockNoteEditor = typeof appSchema.BlockNoteEditor;
