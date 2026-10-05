# Safety Lab Aero VMware appliance: the machine's whole file system (5 Oct 2026).
# Built by build-appliance.sh; never run as a container. Ubuntu 24.04 LTS, a kernel and boot loader
# for a virtual machine, Docker from Ubuntu's own packages, VMware's guest tools, and the kit.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      linux-image-virtual initramfs-tools grub-pc systemd-sysv systemd-timesyncd systemd-resolved \
      netplan.io iproute2 iputils-ping ca-certificates openssh-server sudo whiptail zstd openssl curl \
      open-vm-tools docker.io docker-compose-v2 less nano \
 && apt-get clean && rm -rf /var/lib/apt/lists/*
# The maintenance login. No password until the first-start setup asks for one (locked until then).
RUN useradd -m -s /usr/local/bin/safetylab-menu -G docker,sudo safetylab && passwd -l safetylab \
 && echo /usr/local/bin/safetylab-menu >> /etc/shells && echo safetylab > /etc/hostname
COPY files/safetylab-setup /usr/local/sbin/safetylab-setup
COPY files/safetylab-menu /usr/local/bin/safetylab-menu
COPY files/safetylab-setup.service /etc/systemd/system/safetylab-setup.service
COPY files/40-safetylab-dhcp.yaml /etc/netplan/40-safetylab-dhcp.yaml
COPY files/issue /etc/issue
COPY kit/ /opt/safetylab/customer-install/
COPY images.tar.zst /opt/safetylab/images.tar.zst
# resolv.conf, hostname and fstab are written by build-appliance.sh: Docker holds them during a build.
RUN chmod 600 /etc/netplan/40-safetylab-dhcp.yaml \
 && chmod 755 /usr/local/sbin/safetylab-setup /usr/local/bin/safetylab-menu /opt/safetylab/customer-install/selfhost/*.sh /opt/safetylab/customer-install/db/*.sh \
 && chown -R safetylab:safetylab /opt/safetylab \
 && systemctl enable safetylab-setup.service docker.service ssh.service systemd-networkd.service systemd-resolved.service open-vm-tools.service \
 && printf 'GRUB_DEFAULT=0\nGRUB_TIMEOUT=1\nGRUB_CMDLINE_LINUX_DEFAULT="quiet"\nGRUB_CMDLINE_LINUX="net.ifnames=1"\nGRUB_TERMINAL=console\n' > /etc/default/grub \
 && printf 'mptspi\nmptsas\nvmw_pvscsi\nahci\nata_piix\nsd_mod\next4\n' >> /etc/initramfs-tools/modules
