package 'Example: light aircraft wheel brakes' {
    private import RequirementDerivation::*;
    private import ScalarValues::*;
    doc /* Exported from Sys Lab on 2026-10-08. The architecture, functions, allocations and requirements of Example: light aircraft wheel brakes. */

    metadata def SysLab {
        attribute id : String[0..1];
        attribute kind : String[0..1];
        attribute title : String[0..1];
        attribute category : String[0..1];
        attribute status : String[0..1];
        attribute dal : String[0..1];
        attribute methods : String[0..1];
        attribute rationale : String[0..1];
        attribute derivedFlag : String[0..1];
        attribute level : String[0..1];
        attribute unit : String[0..1];
        attribute basis : String[0..1];
        attribute scope : String[0..1];
        attribute owner : String[0..1];
        attribute guard : String[0..1];
        attribute effect : String[0..1];
        attribute fc : String[0..1];
        attribute mac : String[0..1];
        attribute conn : String[0..1];
        attribute expr : String[0..1];
        attribute binds : String[0..1];
        attribute initial : String[0..1];
        attribute perLine : String[0..1];
        attribute range : String[0..1];
        attribute rate : String[0..1];
        attribute phases : String[0..1];
        attribute missions : String[0..1];
        attribute usecases : String[0..1];
        attribute lowest : String[0..1];
        attribute highest : String[0..1];
        attribute duration : String[0..1];
        attribute limit : String[0..1];
        attribute severity : String[0..1];
        attribute dalWhy : String[0..1];
    }

    package Architecture {
        item def 'Electrical power';
        port def 'Electrical power port' {
            out item carried : 'Electrical power';
        }
        item def 'Signal';
        port def 'Signal port' {
            out item carried : 'Signal';
        }
        item def 'Data';
        port def 'Data port' {
            out item carried : 'Data';
        }
        port def <'IF-28VDC-ESS'> '28 V DC essential power' {
            @SysLab { :>> kind = "Interface type"; }
            doc /* Essential DC bus supply to flight-critical loads. */
            out item carried : 'Electrical power';
            attribute 'Nominal voltage' : String = "28" {
                @SysLab { :>> id = "voltage"; :>> unit = "V"; }
            }
            attribute 'Voltage range' : String = "22 to 29.5" {
                @SysLab { :>> id = "range"; :>> unit = "V"; }
            }
            attribute 'Maximum current' : String {
                @SysLab { :>> id = "current"; :>> unit = "A"; :>> perLine = "yes"; }
            }
            attribute 'Power quality standard' : String = "MIL-STD-704F" {
                @SysLab { :>> id = "quality"; }
            }
            attribute 'Connector and pins' : String {
                @SysLab { :>> id = "connector"; :>> perLine = "yes"; }
            }
        }
        port def <'IF-BRK-CMD'> 'Brake pressure command' {
            @SysLab { :>> kind = "Interface type"; }
            doc /* Analog command from the brake control unit to the actuator valve. */
            out item carried : 'Signal';
            attribute 'Discrete or analog' : String = "Analog" {
                @SysLab { :>> id = "kind"; }
            }
            attribute 'Levels or range' : String = "4 to 20" {
                @SysLab { :>> id = "levels"; :>> unit = "mA"; }
            }
            attribute 'Maximum latency' : String = "20" {
                @SysLab { :>> id = "latency"; :>> unit = "ms"; }
            }
            attribute 'Connector and pins' : String {
                @SysLab { :>> id = "connector"; :>> perLine = "yes"; }
            }
            out item 'Left brake pressure command' : 'Signal' {
                @SysLab { :>> kind = "Signal"; :>> unit = "psi"; :>> range = "0 to 3000"; :>> rate = "100 Hz"; }
            }
            out item 'Right brake pressure command' : 'Signal' {
                @SysLab { :>> kind = "Signal"; :>> unit = "psi"; :>> range = "0 to 3000"; :>> rate = "100 Hz"; }
            }
        }
        part def <'PD-FCC'> 'Flight control computer' {
            @SysLab { :>> kind = "Part definition"; :>> category = "Item"; }
            doc /* Triplex flight control computer: one design, three installed units. */
            port 'in 28 V DC' : ~'28 V DC essential power';
            attribute 'mass' : Real default = 2.4 {
                @SysLab { :>> unit = "kg"; :>> basis = "Estimate"; }
            }
            attribute 'power' : Real default = 120.0 {
                @SysLab { :>> unit = "W"; :>> basis = "Estimate"; }
            }
        }
        part def <'AIRCRAFT'> 'Aircraft' {
            @SysLab { :>> kind = "Aircraft"; }
            part 'BRK' : 'Wheel brake system';
            part 'FCS' : 'Flight control system';
            part 'ELEC' : 'Electrical power system';
            attribute 'mass allocation' : Real = 25.0 {
                @SysLab { :>> unit = "kg"; :>> basis = "Allocation"; :>> rationale = "Equipment mass allowed for these systems in the aircraft weight budget."; }
            }
            attribute 'power allocation' : Real = 500.0 {
                @SysLab { :>> unit = "W"; :>> basis = "Allocation"; :>> rationale = "What the essential bus can supply (its rating)."; }
            }
            constraint 'CS-003' : Values::'CS-003 Essential bus load' {
                in 'p load' = 'ELEC'.'ELEC-ITM-ESS'.'load';
                in 'p bcu' = 'BRK'.'BRK-SS-CTL'.'BRK-ITM-BCU'.'power';
                in 'p fcc1' = 'FCS'.'FCS-ITM-FCC1'.'power';
                in 'p fcc2' = 'FCS'.'FCS-ITM-FCC2'.'power';
                in 'p fcc3' = 'FCS'.'FCS-ITM-FCC3'.'power';
            }
            flow <'C-001'> 'Brake control unit feed' of '28 V DC' : 'Electrical power' from 'ELEC'.'ELEC-ITM-ESS'.'out 28 V DC essential power'.carried to 'BRK'.'BRK-SS-CTL'.'BRK-ITM-BCU'.'in 28 V DC essential power'.carried {
                attribute 'Maximum current' : String = "6";
            }
            flow <'C-002'> 'Flight control feed' of '28 V DC' : 'Electrical power' from 'ELEC'.'ELEC-ITM-ESS'.'out 28 V DC essential power'.carried to 'FCS'.'in 28 V DC essential power'.carried {
                attribute 'Maximum current' : String = "15";
            }
        }
        part def <'BRK'> 'Wheel brake system' {
            @SysLab { :>> kind = "System"; }
            part 'BRK-SS-CTL' : 'Brake control subsystem';
            part 'BRK-ITM-ACT' : 'Brake actuator';
            attribute 'mass' : Real {
                @SysLab { :>> unit = "kg"; :>> basis = "Calculated"; }
            }
            attribute 'mass allocation' : Real = 12.0 {
                @SysLab { :>> unit = "kg"; :>> basis = "Allocation"; :>> rationale = "Allocated from the aircraft weight budget."; }
            }
            constraint 'CS-001' : Values::'CS-001 Brake system mass' {
                in 'p mass' = 'mass';
                in 'p bcu' = 'BRK-SS-CTL'.'BRK-ITM-BCU'.'mass';
                in 'p actuator' = 'BRK-ITM-ACT'.'mass';
            }
            assert constraint 'CS-002' : Values::'CS-002 Brake system mass within its allocation' {
                in 'p mass' = 'mass';
                in 'p allocation' = 'mass allocation';
            }
            flow <'C-003'> of 'Brake pressure command' : 'Signal' from 'BRK-SS-CTL'.'BRK-ITM-BCU'.'out Brake pressure command'.carried to 'BRK-ITM-ACT'.'in Brake pressure command'.carried;
        }
        part def <'FCS'> 'Flight control system' {
            @SysLab { :>> kind = "System"; }
            part 'FCS-ITM-FCC1' : 'Flight control computer' {
                @SysLab { :>> kind = "Item"; :>> title = "Flight control computer 1"; }
            }
            part 'FCS-ITM-FCC2' : 'Flight control computer' {
                @SysLab { :>> kind = "Item"; :>> title = "Flight control computer 2"; }
            }
            part 'FCS-ITM-FCC3' : 'Flight control computer' {
                @SysLab { :>> kind = "Item"; :>> title = "Flight control computer 3"; }
                attribute :>> 'mass' = 2.7 {
                    @SysLab { :>> unit = "kg"; :>> basis = "Estimate"; }
                }
            }
            part 'FCS-ITM-SAI' : 'Standby attitude indicator';
            port 'in 28 V DC essential power' : ~'28 V DC essential power';
            attribute 'mass allocation' : Real = 10.0 {
                @SysLab { :>> unit = "kg"; :>> basis = "Allocation"; :>> rationale = "From the aircraft weight budget."; }
            }
        }
        part def <'ELEC'> 'Electrical power system' {
            @SysLab { :>> kind = "System"; }
            part 'ELEC-ITM-ESS' : 'Essential DC bus';
            attribute 'battery energy' : Real = 780.0 {
                @SysLab { :>> unit = "Wh"; :>> basis = "Estimate"; :>> rationale = "Main battery: what it holds for essential loads if the generator is lost."; }
            }
        }
        part def <'BRK-SS-CTL'> 'Brake control subsystem' {
            @SysLab { :>> kind = "Subsystem"; }
            part 'BRK-ITM-BCU' : 'Dual-channel brake control unit';
            part 'BRK-ITM-SW' : 'Brake control software';
            flow <'C-004'> of 'Skid detected' : 'Data' from 'BRK-ITM-SW'.'out Skid detected'.carried to 'BRK-ITM-BCU'.'in Skid detected'.carried;
        }
        part def <'BRK-ITM-BCU'> 'Dual-channel brake control unit' {
            @SysLab { :>> kind = "Item"; }
            port 'in Skid detected' : ~'Data port';
            port 'in 28 V DC essential power' : ~'28 V DC essential power';
            port 'out Brake pressure command' : 'Brake pressure command';
            attribute 'mass' : Real = 4.2 {
                @SysLab { :>> unit = "kg"; :>> basis = "Estimate"; :>> rationale = "Supplier estimate."; :>> lowest = "3.9"; :>> highest = "4.8"; }
            }
            attribute 'power' : Real = 45.0 {
                @SysLab { :>> unit = "W"; :>> basis = "Estimate"; :>> lowest = "40.0"; :>> highest = "55.0"; }
            }
            exhibit state 'modes' : Behavior::'Brake control unit modes';
        }
        part def <'BRK-ITM-SW'> 'Brake control software' {
            @SysLab { :>> kind = "Item"; }
            port 'out Skid detected' : 'Data port';
        }
        part def <'BRK-ITM-ACT'> 'Brake actuator' {
            @SysLab { :>> kind = "Item"; }
            port 'in Brake pressure command' : ~'Brake pressure command';
            attribute 'mass' : Real = 6.5 {
                @SysLab { :>> unit = "kg"; :>> basis = "Estimate"; :>> rationale = "Supplier estimate."; :>> lowest = "6.1"; :>> highest = "7.4"; }
            }
        }
        part def <'ELEC-ITM-ESS'> 'Essential DC bus' {
            @SysLab { :>> kind = "Item"; }
            port 'out 28 V DC essential power' : '28 V DC essential power';
            attribute 'load' : Real {
                @SysLab { :>> unit = "W"; :>> basis = "Calculated"; }
            }
            attribute 'capacity' : Real = 500.0 {
                @SysLab { :>> unit = "W"; :>> basis = "Allocation"; :>> rationale = "Bus rating."; }
            }
            attribute 'mass' : Real = 3.1 {
                @SysLab { :>> unit = "kg"; :>> basis = "Measured"; :>> rationale = "Weighed with its harness stubs."; }
            }
            assert constraint 'CS-004' : Values::'CS-004 Essential bus within 80% of its rating' {
                in 'p load' = 'load';
                in 'p capacity' = 'capacity';
            }
        }
        part def <'FCS-ITM-SAI'> 'Standby attitude indicator' {
            @SysLab { :>> kind = "Item"; }
            attribute 'mass' : Real = 1.1 {
                @SysLab { :>> unit = "kg"; :>> basis = "Measured"; :>> rationale = "Weighed on the bench."; :>> lowest = "1.05"; :>> highest = "1.15"; }
            }
            attribute 'power' : Real = 15.0 {
                @SysLab { :>> unit = "W"; :>> basis = "Estimate"; }
            }
        }
        part aircraft : 'Aircraft';
    }

    package Logical {
        part def <'BRK-LC-CMD'> 'Brake command computation' {
            @SysLab { :>> kind = "Logical component"; :>> scope = "BRK"; }
            doc /* Turns pedal demand and wheel speed into a pressure command for each brake. */
        }
        part def <'BRK-LC-SKID'> 'Skid detection' {
            @SysLab { :>> kind = "Logical component"; :>> scope = "BRK"; }
            doc /* Finds a wheel that is about to lock: software running on the brake control unit. */
        }
        part def <'BRK-LC-ACT'> 'Pressure actuation' {
            @SysLab { :>> kind = "Logical component"; :>> scope = "BRK"; }
            doc /* Turns the pressure command into brake force. */
        }
        part def 'Wheel brake system logical architecture' {
            @SysLab { :>> kind = "Logical architecture"; :>> scope = "BRK"; }
            part 'BRK-LC-CMD' : 'Brake command computation';
            part 'BRK-LC-SKID' : 'Skid detection';
            part 'BRK-LC-ACT' : 'Pressure actuation';
            connection <'LI-001'> connect 'BRK-LC-SKID' to 'BRK-LC-CMD' {
                @SysLab { :>> kind = "Data"; :>> title = "Skid detected"; :>> conn = "C-004"; }
            }
            connection <'LI-002'> connect 'BRK-LC-CMD' to 'BRK-LC-ACT' {
                @SysLab { :>> kind = "Signal"; :>> title = "Pressure command"; :>> conn = "C-003"; }
            }
        }
        part 'BRK logical' : 'Wheel brake system logical architecture';
        allocate Logical::'BRK logical'.'BRK-LC-CMD' to Architecture::aircraft.'BRK'.'BRK-SS-CTL'.'BRK-ITM-BCU';
        allocate Logical::'BRK logical'.'BRK-LC-SKID' to Architecture::aircraft.'BRK'.'BRK-SS-CTL'.'BRK-ITM-SW';
        allocate Logical::'BRK logical'.'BRK-LC-SKID' to Architecture::aircraft.'BRK'.'BRK-SS-CTL'.'BRK-ITM-BCU';
        allocate Logical::'BRK logical'.'BRK-LC-ACT' to Architecture::aircraft.'BRK'.'BRK-ITM-ACT';
    }

    package Functions {
        item def 'Functional flow';
        action def <'F-DECEL'> 'Decelerate on the ground' {
            @SysLab { :>> kind = "Aircraft function"; }
            doc /* Stop the aircraft after landing and during taxi. */
            action 'SF-BRAKE' : 'Wheel braking';
        }
        action def <'SF-BRAKE'> 'Wheel braking' {
            @SysLab { :>> kind = "Aircraft function"; }
            doc /* Brake the main gear wheels on pilot command. */
        }
        action def <'F-CONTROL'> 'Control flight' {
            @SysLab { :>> kind = "Aircraft function"; }
            doc /* Give the pilot control of the aircraft attitude. */
            action 'SF-PITCH' : 'Pitch control';
        }
        action def <'SF-PITCH'> 'Pitch control' {
            @SysLab { :>> kind = "Aircraft function"; }
            doc /* Control pitch attitude. */
        }
        action def <'F-POWER'> 'Provide electrical power' {
            @SysLab { :>> kind = "Aircraft function"; :>> severity = "Hazardous"; :>> dal = "B"; }
            doc /* Generate and distribute electrical power. */
            action 'SF-ESS' : 'Essential power';
        }
        action def <'SF-ESS'> 'Essential power' {
            @SysLab { :>> kind = "Aircraft function"; }
            doc /* Supply the essential loads. */
        }
        action def <'BRK-APPLY'> 'Apply wheel braking' {
            @SysLab { :>> kind = "System function"; }
        }
        action def <'BRK-SKID'> 'Prevent wheel skid' {
            @SysLab { :>> kind = "System function"; }
        }
        action def <'FCS-ELEV'> 'Command elevator' {
            @SysLab { :>> kind = "System function"; }
        }
        action def <'ELEC-DIST'> 'Distribute DC power' {
            @SysLab { :>> kind = "System function"; :>> severity = "Hazardous"; :>> dal = "C"; :>> dalWhy = "Two independent DC buses (ELEC-001): each channel is developed to DAL C, with independence shown under ARP4754B 5.2."; }
        }
        action def 'Aircraft functions' {
            @SysLab { :>> kind = "Function group"; }
            action 'F-DECEL' : 'Decelerate on the ground';
            action 'F-CONTROL' : 'Control flight';
            action 'F-POWER' : 'Provide electrical power';
        }
        action def 'Wheel brake system functions' {
            @SysLab { :>> kind = "Function group"; }
            action 'BRK-APPLY' : 'Apply wheel braking' {
                in item 'from BRK-SKID';
            }
            action 'BRK-SKID' : 'Prevent wheel skid' {
                out item 'to BRK-APPLY';
            }
        }
        action def 'Flight control system functions' {
            @SysLab { :>> kind = "Function group"; }
            action 'FCS-ELEV' : 'Command elevator';
        }
        action def 'Electrical power system functions' {
            @SysLab { :>> kind = "Function group"; }
            action 'ELEC-DIST' : 'Distribute DC power';
        }
        action 'aircraft functions' : 'Aircraft functions';
        action 'BRK functions' : 'Wheel brake system functions';
        action 'FCS functions' : 'Flight control system functions';
        action 'ELEC functions' : 'Electrical power system functions';
        flow <'F-001'> of 'Brake release command' : 'Functional flow' from 'BRK functions'.'BRK-SKID'.'to BRK-APPLY' to 'BRK functions'.'BRK-APPLY'.'from BRK-SKID';
        allocate 'aircraft functions'.'F-DECEL' to Architecture::aircraft;
        allocate 'aircraft functions'.'F-DECEL'.'SF-BRAKE' to Architecture::aircraft.'BRK';
        allocate 'aircraft functions'.'F-CONTROL' to Architecture::aircraft;
        allocate 'aircraft functions'.'F-CONTROL'.'SF-PITCH' to Architecture::aircraft.'FCS';
        allocate 'aircraft functions'.'F-POWER' to Architecture::aircraft;
        allocate 'aircraft functions'.'F-POWER'.'SF-ESS' to Architecture::aircraft.'ELEC';
        allocate 'BRK functions'.'BRK-APPLY' to Architecture::aircraft.'BRK';
        allocate 'BRK functions'.'BRK-APPLY' to Architecture::aircraft.'BRK'.'BRK-SS-CTL'.'BRK-ITM-BCU';
        allocate 'BRK functions'.'BRK-SKID' to Architecture::aircraft.'BRK'.'BRK-SS-CTL'.'BRK-ITM-BCU';
        allocate 'BRK functions'.'BRK-SKID' to Architecture::aircraft.'BRK'.'BRK-SS-CTL'.'BRK-ITM-SW';
        allocate 'FCS functions'.'FCS-ELEV' to Architecture::aircraft.'FCS';
        allocate 'FCS functions'.'FCS-ELEV' to Architecture::aircraft.'FCS'.'FCS-ITM-FCC1';
        allocate 'FCS functions'.'FCS-ELEV' to Architecture::aircraft.'FCS'.'FCS-ITM-FCC2';
        allocate 'FCS functions'.'FCS-ELEV' to Architecture::aircraft.'FCS'.'FCS-ITM-FCC3';
        allocate 'ELEC functions'.'ELEC-DIST' to Architecture::aircraft.'ELEC';
        allocate 'ELEC functions'.'ELEC-DIST' to Architecture::aircraft.'ELEC'.'ELEC-ITM-ESS';
        allocate 'BRK functions'.'BRK-APPLY' to Logical::'BRK logical'.'BRK-LC-CMD';
        allocate 'BRK functions'.'BRK-SKID' to Logical::'BRK logical'.'BRK-LC-SKID';
        allocate 'BRK functions'.'BRK-APPLY' to Logical::'BRK logical'.'BRK-LC-ACT';
        dependency 'BRK-APPLY traces to SF-BRAKE' from 'Wheel brake system functions'::'BRK-APPLY' to 'Decelerate on the ground'::'SF-BRAKE';
        dependency 'BRK-SKID traces to SF-BRAKE' from 'Wheel brake system functions'::'BRK-SKID' to 'Decelerate on the ground'::'SF-BRAKE';
        dependency 'FCS-ELEV traces to SF-PITCH' from 'Flight control system functions'::'FCS-ELEV' to 'Control flight'::'SF-PITCH';
        dependency 'ELEC-DIST traces to SF-ESS' from 'Electrical power system functions'::'ELEC-DIST' to 'Provide electrical power'::'SF-ESS';
    }

    package Requirements {
        package 'Aircraft' {
            package 'Aircraft requirements' {
                @SysLab { :>> kind = "Requirement set"; :>> id = "AC"; :>> level = "Aircraft"; }
                requirement <'AC-001'> 'AC-001: Ground deceleration' {
                    doc /* The aircraft shall decelerate from 150 kt to a full stop within the landing field length. */
                    @SysLab { :>> id = "AC-001"; :>> title = "Ground deceleration"; :>> category = "Functional"; :>> status = "Draft"; :>> dal = "A"; :>> methods = "Test, Analysis"; :>> derivedFlag = "false"; }
                }
                requirement <'AC-002'> 'AC-002: Pitch control' {
                    doc /* The aircraft shall provide pilot control of pitch attitude throughout the flight envelope. */
                    @SysLab { :>> id = "AC-002"; :>> title = "Pitch control"; :>> category = "Functional"; :>> status = "Approved"; :>> dal = "A"; :>> methods = "Test"; :>> derivedFlag = "false"; }
                }
                requirement <'AC-003'> 'AC-003: Essential power' {
                    doc /* The aircraft shall supply electrical power to essential loads in all phases of flight. */
                    @SysLab { :>> id = "AC-003"; :>> title = "Essential power"; :>> category = "Functional"; :>> status = "Approved"; :>> dal = "B"; :>> methods = "Test, Analysis"; :>> derivedFlag = "false"; }
                }
                requirement <'AC-004'> 'AC-004: Loss of deceleration' {
                    doc /* The probability of total loss of ground deceleration shall not exceed 1.0E-09 per flight hour. */
                    @SysLab { :>> id = "AC-004"; :>> title = "Loss of deceleration"; :>> category = "Safety"; :>> status = "Approved"; :>> dal = "A"; :>> methods = "Analysis"; :>> derivedFlag = "false"; }
                }
                requirement <'AC-005'> 'AC-005: Cabin noise' {
                    doc /* The cabin noise level should be appropriate for passenger comfort. */
                    @SysLab { :>> id = "AC-005"; :>> title = "Cabin noise"; :>> category = "Environmental"; :>> status = "Draft"; :>> derivedFlag = "false"; }
                }
            }
        }
        package 'Wheel brake system' {
            package 'System requirements' {
                @SysLab { :>> kind = "Requirement set"; :>> id = "BRK"; :>> level = "System"; }
                requirement <'BRK-001'> 'BRK-001: Symmetric braking' {
                    doc /* The wheel brake system shall provide symmetric braking on both main gear wheels on pilot command. */
                    @SysLab { :>> id = "BRK-001"; :>> title = "Symmetric braking"; :>> category = "Functional"; :>> status = "Approved"; :>> dal = "A"; :>> methods = "Test"; :>> derivedFlag = "false"; }
                }
                requirement <'BRK-002'> 'BRK-002: Anti-skid' {
                    doc /* The wheel brake system shall provide anti-skid protection at ground speeds above 10 kt. */
                    @SysLab { :>> id = "BRK-002"; :>> title = "Anti-skid"; :>> category = "Functional"; :>> status = "In review"; :>> dal = "A"; :>> methods = "Test"; :>> derivedFlag = "false"; }
                }
                requirement <'BRK-003'> 'BRK-003: Independent supplies' {
                    doc /* The wheel brake system shall have two independent hydraulic supply paths. */
                    @SysLab { :>> id = "BRK-003"; :>> title = "Independent supplies"; :>> category = "Safety"; :>> status = "Approved"; :>> dal = "A"; :>> methods = "Analysis, Inspection"; :>> derivedFlag = "false"; }
                }
                requirement <'BRK-004'> 'BRK-004: Hot brake warning' {
                    doc /* The brake temperature monitor shall annunciate a hot brake to the flight crew within TBD seconds. */
                    @SysLab { :>> id = "BRK-004"; :>> title = "Hot brake warning"; :>> category = "Human factors"; :>> status = "In review"; :>> dal = "C"; :>> derivedFlag = "true"; }
                }
            }
            package 'Interface requirements' {
                @SysLab { :>> kind = "Requirement set"; :>> id = "BRK-IF"; :>> level = "System"; }
                requirement <'BRK-IF-001'> 'BRK-IF-001: Brake unit power input' {
                    doc /* The brake control unit shall operate on 28 V DC supplied from either essential DC bus. */
                    @SysLab { :>> id = "BRK-IF-001"; :>> title = "Brake unit power input"; :>> category = "Interface"; :>> status = "In review"; :>> dal = "A"; :>> methods = "Test, Inspection"; :>> derivedFlag = "false"; }
                }
            }
            package 'Software item requirements' {
                @SysLab { :>> kind = "Requirement set"; :>> id = "BRK-SW"; :>> level = "Item"; }
                requirement <'BRK-SW-001'> 'BRK-SW-001: Skid detection' {
                    doc /* When wheel speed falls below 85% of aircraft ground speed, the brake control software shall detect a wheel skid within 50 ms. */
                    @SysLab { :>> id = "BRK-SW-001"; :>> title = "Skid detection"; :>> category = "Performance"; :>> status = "In review"; :>> dal = "A"; :>> methods = "Test"; :>> derivedFlag = "false"; }
                }
            }
        }
        package 'Flight control system' {
            package 'System requirements' {
                @SysLab { :>> kind = "Requirement set"; :>> id = "FCS"; :>> level = "System"; }
                requirement <'FCS-001'> 'FCS-001: Elevator command' {
                    doc /* The flight control system shall command elevator position in proportion to pilot pitch input. */
                    @SysLab { :>> id = "FCS-001"; :>> title = "Elevator command"; :>> category = "Functional"; :>> status = "Approved"; :>> dal = "A"; :>> methods = "Test"; :>> derivedFlag = "false"; }
                }
                requirement <'FCS-002'> 'FCS-002: Single bus failure' {
                    doc /* If a single electrical bus failure occurs, then the flight control system shall remain operable. */
                    @SysLab { :>> id = "FCS-002"; :>> title = "Single bus failure"; :>> category = "Safety"; :>> status = "Draft"; :>> dal = "A"; :>> methods = "Test, Analysis"; :>> derivedFlag = "false"; }
                }
            }
        }
        package 'Electrical power system' {
            package 'System requirements' {
                @SysLab { :>> kind = "Requirement set"; :>> id = "ELEC"; :>> level = "System"; }
                requirement <'ELEC-001'> 'ELEC-001: Two DC buses' {
                    doc /* The electrical power system shall provide two independent DC buses to essential loads. */
                    @SysLab { :>> id = "ELEC-001"; :>> title = "Two DC buses"; :>> category = "Functional"; :>> status = "Approved"; :>> dal = "B"; :>> methods = "Test, Inspection"; :>> derivedFlag = "false"; }
                }
            }
            package 'Interface requirements' {
                @SysLab { :>> kind = "Requirement set"; :>> id = "ELEC-IF"; :>> level = "System"; }
                requirement <'ELEC-IF-001'> 'ELEC-IF-001: Brake unit power' {
                    doc /* The electrical power system shall supply power to the brake control unit. */
                    @SysLab { :>> id = "ELEC-IF-001"; :>> title = "Brake unit power"; :>> category = "Interface"; :>> status = "Draft"; :>> methods = "Test"; :>> derivedFlag = "false"; }
                }
            }
        }
        #derivation connection {
            end #original ::> 'Aircraft'::'Aircraft requirements'::'AC-001';
            end #derive ::> 'Wheel brake system'::'System requirements'::'BRK-001';
        }
        #derivation connection {
            end #original ::> 'Aircraft'::'Aircraft requirements'::'AC-001';
            end #derive ::> 'Wheel brake system'::'System requirements'::'BRK-002';
        }
        #derivation connection {
            end #original ::> 'Aircraft'::'Aircraft requirements'::'AC-004';
            end #derive ::> 'Wheel brake system'::'System requirements'::'BRK-003';
        }
        #derivation connection {
            end #original ::> 'Wheel brake system'::'System requirements'::'BRK-002';
            end #derive ::> 'Wheel brake system'::'Software item requirements'::'BRK-SW-001';
        }
        #derivation connection {
            end #original ::> 'Wheel brake system'::'System requirements'::'BRK-003';
            end #derive ::> 'Wheel brake system'::'Interface requirements'::'BRK-IF-001';
        }
        #derivation connection {
            end #original ::> 'Electrical power system'::'System requirements'::'ELEC-001';
            end #derive ::> 'Wheel brake system'::'Interface requirements'::'BRK-IF-001';
        }
        #derivation connection {
            end #original ::> 'Aircraft'::'Aircraft requirements'::'AC-002';
            end #derive ::> 'Flight control system'::'System requirements'::'FCS-001';
        }
        #derivation connection {
            end #original ::> 'Aircraft'::'Aircraft requirements'::'AC-002';
            end #derive ::> 'Flight control system'::'System requirements'::'FCS-002';
        }
        #derivation connection {
            end #original ::> 'Aircraft'::'Aircraft requirements'::'AC-003';
            end #derive ::> 'Flight control system'::'System requirements'::'FCS-002';
        }
        #derivation connection {
            end #original ::> 'Aircraft'::'Aircraft requirements'::'AC-003';
            end #derive ::> 'Electrical power system'::'System requirements'::'ELEC-001';
        }
        satisfy 'Aircraft'::'Aircraft requirements'::'AC-001' by Architecture::aircraft;
        satisfy 'Aircraft'::'Aircraft requirements'::'AC-002' by Architecture::aircraft;
        satisfy 'Aircraft'::'Aircraft requirements'::'AC-003' by Architecture::aircraft;
        satisfy 'Aircraft'::'Aircraft requirements'::'AC-004' by Architecture::aircraft;
        satisfy 'Wheel brake system'::'System requirements'::'BRK-001' by Architecture::aircraft.'BRK';
        satisfy 'Wheel brake system'::'System requirements'::'BRK-002' by Architecture::aircraft.'BRK';
        satisfy 'Wheel brake system'::'System requirements'::'BRK-003' by Architecture::aircraft.'BRK';
        satisfy 'Wheel brake system'::'Interface requirements'::'BRK-IF-001' by Architecture::aircraft.'BRK'.'BRK-SS-CTL'.'BRK-ITM-BCU';
        satisfy 'Wheel brake system'::'Software item requirements'::'BRK-SW-001' by Architecture::aircraft.'BRK'.'BRK-SS-CTL'.'BRK-ITM-SW';
        satisfy 'Flight control system'::'System requirements'::'FCS-001' by Architecture::aircraft.'FCS';
        satisfy 'Flight control system'::'System requirements'::'FCS-002' by Architecture::aircraft.'FCS';
        satisfy 'Electrical power system'::'System requirements'::'ELEC-001' by Architecture::aircraft.'ELEC';
    }

    package Behavior {
        item def 'Message';
        item def 'Trigger';
        part def <'ACT-PILOT'> 'Pilot' {
            @SysLab { :>> kind = "Actor"; :>> category = "Person"; }
            doc /* Flies the aircraft and commands the brakes with the pedals. */
        }
        part def <'ACT-MX'> 'Maintainer' {
            @SysLab { :>> kind = "Actor"; :>> category = "Person"; }
            doc /* Checks and replaces equipment on the ground. */
        }
        use case def <'UC-001'> 'Land and stop on the runway' {
            @SysLab { :>> kind = "Use case"; :>> scope = "AIRCRAFT"; }
            doc /* After touchdown, bring the aircraft to a stop within the landing field length. */
            subject 'subject' : Architecture::'Aircraft';
            actor 'ACT-PILOT' : 'Pilot';
        }
        use case def <'UC-002'> 'Taxi to the gate' {
            @SysLab { :>> kind = "Use case"; :>> scope = "AIRCRAFT"; }
            doc /* Steer and brake on the ground at low speed. */
            subject 'subject' : Architecture::'Aircraft';
            actor 'ACT-PILOT' : 'Pilot';
        }
        use case def <'UC-003'> 'Check the brakes before flight' {
            @SysLab { :>> kind = "Use case"; :>> scope = "AIRCRAFT"; }
            doc /* Run the built-in test and read the result. */
            subject 'subject' : Architecture::'Aircraft';
            actor 'ACT-MX' : 'Maintainer';
        }
        use case def <'UC-004'> 'Stop with one brake channel lost' {
            @SysLab { :>> kind = "Use case"; :>> scope = "AIRCRAFT"; }
            doc /* Stop the aircraft on the remaining channel with the asymmetry alert shown. */
            subject 'subject' : Architecture::'Aircraft';
            actor 'ACT-PILOT' : 'Pilot';
        }
        dependency 'UC-001 relies on F-DECEL' from 'Land and stop on the runway' to Functions::'Aircraft functions'::'F-DECEL';
        dependency 'UC-001 relies on SF-BRAKE' from 'Land and stop on the runway' to Functions::'Decelerate on the ground'::'SF-BRAKE';
        dependency 'UC-002 relies on SF-BRAKE' from 'Taxi to the gate' to Functions::'Decelerate on the ground'::'SF-BRAKE';
        dependency 'UC-003 relies on BRK-SKID' from 'Check the brakes before flight' to Functions::'Wheel brake system functions'::'BRK-SKID';
        dependency 'UC-004 extends UC-001' from 'Stop with one brake channel lost' to 'Land and stop on the runway';
        dependency 'UC-004 relies on BRK-APPLY' from 'Stop with one brake channel lost' to Functions::'Wheel brake system functions'::'BRK-APPLY';
        occurrence def <'SC-001'> 'Brake application after touchdown' {
            @SysLab { :>> kind = "Scenario"; :>> scope = "BRK"; :>> title = "UC-001"; :>> limit = "1000.0"; }
            doc /* Normal braking, both channels working. */
            part 'ACT-PILOT' : 'Pilot';
            part 'BRK' : Architecture::'Wheel brake system';
            part 'BRK-ITM-BCU' : Architecture::'Dual-channel brake control unit';
            part 'BRK-ITM-ACT' : Architecture::'Brake actuator';
            part 'ELEC-ITM-ESS' : Architecture::'Essential DC bus';
            message <'M-1'> 'Press the brake pedals' of 'Message' from 'ACT-PILOT' to 'BRK' {
                @SysLab { :>> kind = "Signal"; :>> duration = "40.0"; }
            }
            message <'M-2'> 'Essential 28 V DC' of 'Message' from 'ELEC-ITM-ESS' to 'BRK-ITM-BCU' {
                @SysLab { :>> kind = "Signal"; :>> duration = "2.0"; }
            }
            message <'M-3'> 'Brake pressure command' of 'Message' from 'BRK-ITM-BCU' to 'BRK-ITM-ACT' {
                @SysLab { :>> kind = "Call"; :>> duration = "12.0"; }
            }
            message <'M-4'> 'Pressure feedback' of 'Message' from 'BRK-ITM-ACT' to 'BRK-ITM-BCU' {
                @SysLab { :>> kind = "Reply"; :>> duration = "8.0"; }
            }
            message <'M-5'> 'Deceleration felt' of 'Message' from 'BRK' to 'ACT-PILOT' {
                @SysLab { :>> kind = "Reply"; :>> duration = "900.0"; }
            }
        }
        state def 'Brake control unit modes' {
            @SysLab { :>> kind = "State machine"; :>> owner = "BRK-ITM-BCU"; :>> initial = "Off"; }
            entry; then 'Off';
            state 'Off' {
                @SysLab { :>> kind = "Off"; }
                doc /* No power. */
            }
            state 'Normal' {
                @SysLab { :>> kind = "Normal"; }
                doc /* Both channels working. */
            }
            state 'One channel' {
                @SysLab { :>> kind = "Degraded"; }
                doc /* One channel lost; braking on the other with the asymmetry alert. */
            }
            state 'Failed' {
                @SysLab { :>> kind = "Failed"; :>> fc = "FC-BRK-ASYM"; }
                doc /* Both channels lost. */
            }
            state 'Anti-skid lost' {
                @SysLab { :>> kind = "Degraded"; :>> fc = "FC-BRK-SKID"; }
                doc /* Braking without skid protection; the crew is told. */
            }
            transition 'T-1' first 'Off' accept 'power on' : 'Trigger' then 'Normal' {
                @SysLab { :>> guard = "built-in test passed"; }
            }
            transition 'T-2' first 'Normal' accept 'channel fault' : 'Trigger' then 'One channel' {
                @SysLab { :>> effect = "show BRAKE ASYM"; }
            }
            transition 'T-3' first 'One channel' accept 'second channel fault' : 'Trigger' then 'Failed' {
                @SysLab { :>> effect = "show BRAKE FAIL"; }
            }
            transition 'T-4' first 'One channel' accept 'channel recovered' : 'Trigger' then 'Normal' {
                @SysLab { :>> guard = "on ground"; }
            }
            transition 'T-5' first 'Normal' accept 'power off' : 'Trigger' then 'Off' {
                @SysLab {  }
            }
            transition 'T-6' first 'Normal' accept 'skid sensing fault' : 'Trigger' then 'Anti-skid lost' {
                @SysLab { :>> effect = "show ANTISKID"; }
            }
            transition 'T-7' first 'Anti-skid lost' accept 'power off' : 'Trigger' then 'Off' {
                @SysLab {  }
            }
        }
    }

    package Values {
        constraint def 'CS-001 Brake system mass' {
            @SysLab { :>> kind = "Constraint"; :>> id = "CS-001"; :>> title = "Brake system mass"; :>> expr = "mass = bcu + actuator"; :>> scope = "BRK"; :>> binds = "mass=BRK.mass; bcu=BRK-ITM-BCU.mass; actuator=BRK-ITM-ACT.mass"; }
            in 'p mass' : Real;
            in 'p bcu' : Real;
            in 'p actuator' : Real;
            'p mass' == ('p bcu' + 'p actuator')
        }
        constraint def 'CS-002 Brake system mass within its allocation' {
            @SysLab { :>> kind = "Constraint"; :>> id = "CS-002"; :>> title = "Brake system mass within its allocation"; :>> expr = "mass <= allocation"; :>> scope = "BRK"; :>> binds = "mass=BRK.mass; allocation=BRK.mass allocation"; }
            in 'p mass' : Real;
            in 'p allocation' : Real;
            'p mass' <= 'p allocation'
        }
        constraint def 'CS-003 Essential bus load' {
            @SysLab { :>> kind = "Constraint"; :>> id = "CS-003"; :>> title = "Essential bus load"; :>> expr = "load = sum(bcu, fcc1, fcc2, fcc3)"; :>> scope = "ELEC"; :>> binds = "load=ELEC-ITM-ESS.load; bcu=BRK-ITM-BCU.power; fcc1=FCS-ITM-FCC1.power; fcc2=FCS-ITM-FCC2.power; fcc3=FCS-ITM-FCC3.power"; }
            in 'p load' : Real;
            in 'p bcu' : Real;
            in 'p fcc1' : Real;
            in 'p fcc2' : Real;
            in 'p fcc3' : Real;
        }
        constraint def 'CS-004 Essential bus within 80% of its rating' {
            @SysLab { :>> kind = "Constraint"; :>> id = "CS-004"; :>> title = "Essential bus within 80% of its rating"; :>> expr = "load <= 0.8 * capacity"; :>> scope = "ELEC"; :>> binds = "load=ELEC-ITM-ESS.load; capacity=ELEC-ITM-ESS.capacity"; }
            in 'p load' : Real;
            in 'p capacity' : Real;
            'p load' <= (0.8 * 'p capacity')
        }
    }

    package Operations {
        occurrence def <'PH-TAXI'> 'Taxi' {
            @SysLab { :>> kind = "Flight phase"; :>> category = "taxi"; }
        }
        occurrence def <'PH-TAKEOFF'> 'Takeoff' {
            @SysLab { :>> kind = "Flight phase"; :>> category = "takeoff"; }
        }
        occurrence def <'PH-CLIMB'> 'Climb' {
            @SysLab { :>> kind = "Flight phase"; :>> category = "climb"; }
        }
        occurrence def <'PH-CRUISE'> 'Cruise' {
            @SysLab { :>> kind = "Flight phase"; :>> category = "cruise"; }
        }
        occurrence def <'PH-DESCENT'> 'Descent' {
            @SysLab { :>> kind = "Flight phase"; :>> category = "descent"; }
        }
        occurrence def <'PH-APPROACH'> 'Approach' {
            @SysLab { :>> kind = "Flight phase"; :>> category = "approach"; }
        }
        occurrence def <'PH-LANDING'> 'Landing' {
            @SysLab { :>> kind = "Flight phase"; :>> category = "landing"; }
        }
        occurrence def <'MSN-001'> 'Training sortie' {
            @SysLab { :>> kind = "Mission"; }
            doc /* A typical school flight from the home airfield and back. */
            occurrence 'leg 1' : 'Taxi' {
                attribute 'duration' : Real = 10.0 {
                    @SysLab { :>> unit = "min"; }
                }
            }
            occurrence 'leg 2' : 'Takeoff' {
                attribute 'duration' : Real = 2.0 {
                    @SysLab { :>> unit = "min"; }
                }
            }
            occurrence 'leg 3' : 'Climb' {
                attribute 'duration' : Real = 8.0 {
                    @SysLab { :>> unit = "min"; }
                }
            }
            occurrence 'leg 4' : 'Cruise' {
                attribute 'duration' : Real = 60.0 {
                    @SysLab { :>> unit = "min"; }
                }
            }
            occurrence 'leg 5' : 'Descent' {
                attribute 'duration' : Real = 10.0 {
                    @SysLab { :>> unit = "min"; }
                }
            }
            occurrence 'leg 6' : 'Approach' {
                attribute 'duration' : Real = 6.0 {
                    @SysLab { :>> unit = "min"; }
                }
            }
            occurrence 'leg 7' : 'Landing' {
                attribute 'duration' : Real = 2.0 {
                    @SysLab { :>> unit = "min"; }
                }
            }
            occurrence 'leg 8' : 'Taxi' {
                attribute 'duration' : Real = 8.0 {
                    @SysLab { :>> unit = "min"; }
                }
            }
        }
        occurrence def <'CAP-001'> 'Land and stop on a short runway' {
            @SysLab { :>> kind = "Capability"; :>> phases = "PH-LANDING"; :>> missions = "MSN-001"; }
            doc /* Operate from the 900 m runways of the school's airfields. */
            attribute 'Landing distance' : String = "at most 900" {
                @SysLab { :>> unit = "m"; }
            }
        }
        occurrence def <'CAP-002'> 'Controlled flight throughout the sortie' {
            @SysLab { :>> kind = "Capability"; :>> phases = "PH-TAKEOFF, PH-CLIMB, PH-CRUISE, PH-DESCENT, PH-APPROACH"; :>> missions = "MSN-001"; }
            attribute 'Pitch control available' : String = "whole flight" {
                @SysLab {  }
            }
        }
        occurrence def <'CAP-003'> 'Power for flight-critical loads' {
            @SysLab { :>> kind = "Capability"; :>> missions = "MSN-001"; }
            attribute 'Essential bus availability' : String = "at least 0.99999 per flight hour" {
                @SysLab {  }
            }
        }
        dependency 'CAP-001 delivered by F-DECEL' from 'Land and stop on a short runway' to Functions::'Aircraft functions'::'F-DECEL';
        dependency 'CAP-001 delivered by UC-001' from 'Land and stop on a short runway' to Behavior::'Land and stop on the runway';
        dependency 'CAP-002 delivered by F-CONTROL' from 'Controlled flight throughout the sortie' to Functions::'Aircraft functions'::'F-CONTROL';
        dependency 'CAP-003 delivered by F-POWER' from 'Power for flight-critical loads' to Functions::'Aircraft functions'::'F-POWER';
    }

    package Safety {
        comment 'FC-DECEL-LOSS' /* FC-DECEL-LOSS (Catastrophic): Total loss of wheel braking. On SF-BRAKE. Phases: Landing. From Safety Lab. */
        comment 'FC-PITCH-LOSS' /* FC-PITCH-LOSS (Catastrophic): Total loss of pitch control. On SF-PITCH. Phases: All. From Safety Lab. */
        comment 'FC-BRK-ASYM' /* FC-BRK-ASYM (Hazardous): Asymmetric braking. On BRK-APPLY. Phases: Landing. From Safety Lab. */
        comment 'FC-BRK-SKID' /* FC-BRK-SKID (Major): Undetected wheel skid. On BRK-SKID. Phases: Landing. From Safety Lab. */
        comment 'FC-ELEV-LOSS' /* FC-ELEV-LOSS (Catastrophic): Loss of elevator command. On FCS-ELEV. Phases: All. From Safety Lab. */
        comment 'MAC-FCS-001' /* MAC-FCS-001: minimum acceptable configuration of FCS-ELEV Command elevator. at least 1 of Flight control computer 1, Flight control computer 2, Flight control computer 3. Arbitration: voting 2. Phase: All phases. */
    }
}

