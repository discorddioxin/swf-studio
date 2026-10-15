// Small movies for tests that need a real SWF but not a particular game
// (test-only; nothing in the app imports this).
//
// `FFDEC_SAMPLE_XML` is a JPEXS FFDec XML export (`-swf2xml`, export format
// 2.1) of a tiny AS2 movie, written in exactly FFDec's shape — its DefineShape
// item is verbatim FFDec output — and `ffdecSampleSwf()` is the same movie as
// SWF bytes (`tools/xml2swf`). So a test can upload both forms of one movie, or
// check the XML parser, the SWF writer and the SWF reader against each other.
//
// The movie: a background colour; shape 42 (a triangle); sprite 7, two frames,
// placing the shape at depth 1 as a mask named "mask" clipping to depth 3 (Name
// and ClipDepth both set: the field order a reader can get wrong) and labelling
// frame 2 "open"; a DoInitAction for sprite 7; on the main timeline, sprite 7
// placed as "clip", the label "start" and `stop()`.
import { xmlToSwf } from '../../tools/xml2swf/xml2swf.mjs';

export const FFDEC_SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?><!--
WARNING: The structure of this XML is not final.
In later versions of FFDec it can be changed.
Make sure you use compatible reader/writer based on _xmlExportMajor/_xmlExportMinor keys.
--><swf _xmlExportMajor="2" _xmlExportMinor="1" _generator="JPEXS Free Flash Decompiler v.22.0.2" type="SWF" charset="UTF-8" compression="NONE" encrypted="false" frameCount="1" frameRate="12.0" gfx="false" hasEndTag="true" version="8">
  <displayRect type="RECT" Xmax="11000" Xmin="0" Ymax="8000" Ymin="0" nbits="15"/>
  <tags>
    <item type="SetBackgroundColorTag" forceWriteAsLong="false">
      <backgroundColor type="RGB" blue="153" green="102" red="51"/>
    </item>
    <item type="DefineShapeTag" forceWriteAsLong="true" shapeId="42">
      <shapeBounds type="RECT" Xmax="120" Xmin="0" Ymax="80" Ymin="0" nbits="8"/>
      <shapes type="SHAPEWITHSTYLE" numFillBits="1" numLineBits="0">
        <fillStyles type="FILLSTYLEARRAY">
          <fillStyles>
            <item type="FILLSTYLE" bitmapId="0" fillStyleType="0">
              <color type="RGB" blue="60" green="51" red="43"/>
            </item>
          </fillStyles>
        </fillStyles>
        <lineStyles type="LINESTYLEARRAY">
          <lineStyles/>
          <lineStyles2/>
        </lineStyles>
        <shapeRecords>
          <item type="StyleChangeRecord" fillStyle0="1" fillStyle1="0" lineStyle="0" moveBits="8" moveDeltaX="120" moveDeltaY="80" numFillBits="0" numLineBits="0" stateFillStyle0="true" stateFillStyle1="false" stateLineStyle="false" stateMoveTo="true" stateNewStyles="false"/>
          <item type="StraightEdgeRecord" deltaX="-60" deltaY="-80" generalLineFlag="true" numBits="6" vertLineFlag="false"/>
          <item type="StraightEdgeRecord" deltaX="-60" deltaY="80" generalLineFlag="true" numBits="6" vertLineFlag="false"/>
          <item type="StraightEdgeRecord" deltaX="120" deltaY="0" generalLineFlag="false" numBits="6" vertLineFlag="false"/>
          <item type="EndShapeRecord" endOfShape="0"/>
        </shapeRecords>
      </shapes>
    </item>
    <item type="DefineSpriteTag" forceWriteAsLong="true" frameCount="2" hasEndTag="true" spriteId="7">
      <subTags>
        <item type="PlaceObject2Tag" characterId="42" clipDepth="3" depth="1" forceWriteAsLong="false" name="mask" placeFlagHasCharacter="true" placeFlagHasClipActions="false" placeFlagHasClipDepth="true" placeFlagHasColorTransform="false" placeFlagHasMatrix="true" placeFlagHasName="true" placeFlagHasRatio="false" placeFlagMove="false">
          <matrix type="MATRIX" hasRotate="false" hasScale="false" nRotateBits="0" nScaleBits="0" nTranslateBits="12" rotateSkew0="0.0" rotateSkew1="0.0" scaleX="1.0" scaleY="1.0" translateX="400" translateY="-200"/>
        </item>
        <item type="ShowFrameTag" forceWriteAsLong="false"/>
        <item type="FrameLabelTag" forceWriteAsLong="false" name="open" namedAnchor="false"/>
        <item type="ShowFrameTag" forceWriteAsLong="false"/>
      </subTags>
    </item>
    <item type="DoInitActionTag" actionBytes="0700" forceWriteAsLong="true" spriteId="7"/>
    <item type="PlaceObject2Tag" characterId="7" clipDepth="0" depth="1" forceWriteAsLong="false" name="clip" placeFlagHasCharacter="true" placeFlagHasClipActions="false" placeFlagHasClipDepth="false" placeFlagHasColorTransform="false" placeFlagHasMatrix="true" placeFlagHasName="true" placeFlagHasRatio="false" placeFlagMove="false">
      <matrix type="MATRIX" hasRotate="false" hasScale="false" nRotateBits="0" nScaleBits="0" nTranslateBits="13" rotateSkew0="0.0" rotateSkew1="0.0" scaleX="1.0" scaleY="1.0" translateX="2000" translateY="1600"/>
    </item>
    <item type="FrameLabelTag" forceWriteAsLong="false" name="start" namedAnchor="false"/>
    <item type="DoActionTag" actionBytes="0700" forceWriteAsLong="true"/>
    <item type="ShowFrameTag" forceWriteAsLong="false"/>
  </tags>
</swf>`;

/** The same movie as SWF bytes (uncompressed, written by tools/xml2swf). */
export function ffdecSampleSwf(): Uint8Array {
  return Uint8Array.from(xmlToSwf(FFDEC_SAMPLE_XML)); // (a Buffer: its .slice() is a view of a shared pool)
}
