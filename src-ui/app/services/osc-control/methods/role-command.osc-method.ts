import { OscMethod } from '../osc-method';
import { OSCBoolValue, OSCMessage } from '../../../models/osc-message';
import { OscService } from '../../osc.service';
import { OscControlService } from '../osc-control.service';
import { firstValueFrom } from 'rxjs';
import { EventLogTurnedOffOpenVRDevices } from '../../../models/event-log-entry';
import { OpenVRService } from '../../openvr.service';
import { LighthouseConsoleService } from '../../lighthouse-console.service';
import { EventLogService } from '../../event-log.service';

export class RoleCommandOscMethod extends OscMethod<boolean> {
  constructor(
    osc: OscService,
    private oscControl: OscControlService,
    private openvr: OpenVRService,
    private lighthouseConsole: LighthouseConsoleService,
    private eventLog: EventLogService,
  ) {
    super(osc, {
      description: 'Turns off specific devices based on role (See documentation)',
      address: '/OyasumiVR/PowerOff/',
      addressAliases: ['/Oyasumi/TurnOff/'],
      type: 'Bool',
      initialValue: false,
      isVRCAvatarParameter: true,
      access: 'ReadWrite',
    });
  }

  async handleOSCMessage(message: OSCMessage) {
    const { value: newState } = message.values[0] as OSCBoolValue;
    if (newState) {
      const role = message.address.substring(message.address.lastIndexOf('/') + 1);
      await this.handleTurnOffRole(role);
      await this.setValue(false);
      await this.oscControl.resyncAllVRCParameters();
    }
  }

  private async handleTurnOffRole(role: string) {
    const devices = (await firstValueFrom(this.openvr.devices)).filter(
      (d) => d.handleType == role && d.canPowerOff
    );
    if (devices.length == 0) return;
    
    await this.lighthouseConsole.turnOffDevices(devices);

    this.eventLog.logEvent({
      type: 'turnedOffOpenVRDevices',
      reason: 'OSC_CONTROL',
      devices: role.toUpperCase()
    } as EventLogTurnedOffOpenVRDevices);
  }
}
