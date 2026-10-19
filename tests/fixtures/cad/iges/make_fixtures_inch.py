# An IGES file written in inches (unit flag 1): the same pipe and bracket, model space in mm, file in inches.
from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakeBox
from OCP.gp import gp_Ax2, gp_Pnt, gp_Dir
from OCP.IGESControl import IGESControl_Writer, IGESControl_Controller
IGESControl_Controller.Init_s()
cyl = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0,0,0), gp_Dir(1,0,0)), 10.0, 200.0).Shape()
box = BRepPrimAPI_MakeBox(gp_Pnt(300,-25,-10), 100.0, 50.0, 20.0).Shape()
w = IGESControl_Writer("IN", 1)
w.AddShape(cyl); w.AddShape(box); w.ComputeModel()
assert w.Write("two_parts_inch_brep.igs")
