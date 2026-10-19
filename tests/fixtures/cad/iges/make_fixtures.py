from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakeBox
from OCP.gp import gp_Ax2, gp_Pnt, gp_Dir
from OCP.TDocStd import TDocStd_Document
from OCP.TCollection import TCollection_ExtendedString
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ColorSurf
from OCP.TDataStd import TDataStd_Name
from OCP.Quantity import Quantity_Color, Quantity_TOC_RGB
from OCP.IGESCAFControl import IGESCAFControl_Writer
from OCP.IGESControl import IGESControl_Controller
from OCP.Interface import Interface_Static
import sys
IGESControl_Controller.Init_s()
def make(path, unit, brep):
    Interface_Static.SetCVal_s("write.iges.unit", unit)
    Interface_Static.SetIVal_s("write.iges.brep.mode", brep)
    doc = TDocStd_Document(TCollection_ExtendedString("XmlXCAF"))
    st = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main()); ct = XCAFDoc_DocumentTool.ColorTool_s(doc.Main())
    cyl = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0,0,0), gp_Dir(1,0,0)), 10.0, 200.0).Shape()
    box = BRepPrimAPI_MakeBox(gp_Pnt(300,-25,-10), 100.0, 50.0, 20.0).Shape()
    for shp, nm, rgb in ((cyl, "PIPE-1", (0.8,0.1,0.1)), (box, "BRACKET-2", (0.1,0.3,0.8))):
        l = st.AddShape(shp, False)
        TDataStd_Name.Set_s(l, TCollection_ExtendedString(nm))
        ct.SetColor(l, Quantity_Color(*rgb, Quantity_TOC_RGB), XCAFDoc_ColorSurf)
    w = IGESCAFControl_Writer(); w.SetNameMode(True); w.SetColorMode(True)
    assert w.Transfer(doc)
    assert w.Write(path)
make("two_parts_mm.igs", "MM", 0)
# the inch file: make_fixtures_inch.py (the XCAF writer writes the document unit, always mm here)
