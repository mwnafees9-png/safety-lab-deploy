#!/usr/bin/env bash
# ============================================================================
# build-appliance.sh: build the Safety Lab Aero VMware appliance (.ova) (5 Oct 2026).
#
# Needs a Linux build machine with root, Docker, loop devices, qemu-img and sfdisk. Never run on a
# customer machine. The appliance is built from a COMMIT of the kit, like the zip, and carries every
# container image the stack needs, so the customer's server downloads nothing.
#
#   sudo SLAB_REPO=/path/to/safety-lab-deploy bash build-appliance.sh [out-dir]
#
# Steps: save the images -> build the file system (Dockerfile) -> write it onto a 60 GB disk with a
# boot loader -> convert to VMware's streamOptimized disk -> wrap in an .ova with a checksum list.
# ============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="${SLAB_REPO:-$(cd "$HERE/../.." && pwd)}"
REF="${SLAB_REF:-HEAD}"
OUT="${1:-$PWD/appliance-out}"
DISK_GB=60
stop(){ echo "STOP: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || stop "run as root (it mounts a disk image)."
for c in docker qemu-img sfdisk losetup partx mkfs.ext4 zstd tar sha256sum; do command -v $c >/dev/null || stop "missing $c"; done
mkdir -p "$OUT"; W="$OUT/work"; rm -rf "$W"; mkdir -p "$W/ctx"
VERSION="$(git -C "$REPO" rev-parse --short "$REF")"
NAME="SafetyLabAero-server-$(date +%Y-%m-%d)-$VERSION"

echo "== 1. the kit, from commit $VERSION"
git -C "$REPO" archive "$REF" customer-install | tar -x -C "$W" 
mkdir -p "$W/ctx/kit"; cp -r "$W/customer-install/." "$W/ctx/kit/"
rm -rf "$W/ctx/kit/appliance" "$W/ctx/kit/"*.docx "$W/ctx/kit/"*.pdf
cp -r "$W/customer-install/appliance/files" "$W/customer-install/appliance/Dockerfile" "$W/ctx/"

echo "== 2. every container image the stack runs"
# Compose itself says which images the exact service set install.sh starts uses (the services
# switched off in docker-compose.safetylab.yml are left out), plus the two images the scripts run
# themselves: curl (to talk to the services from inside Docker) and node:22-alpine (the stack's own
# key generator, stack-src/utils/add-new-auth-keys.sh). Found by the offline boot test, 5 Oct 2026.
C="$W/compose"; mkdir -p "$C"; cp -r "$W/ctx/kit/selfhost/stack-src/." "$C/"; cp "$W/ctx/kit/selfhost/docker-compose.safetylab.yml" "$C/"; : > "$C/ai-proxy.env"
IMAGES="$(cd "$C" && docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.caddy.yml -f docker-compose.safetylab.yml config --images | sort -u; echo curlimages/curl:8.10.1; echo node:22-alpine)"
[ "$(printf '%s\n' $IMAGES | grep -c .)" -ge 10 ] || stop "could not list the stack's images"
for i in $IMAGES; do docker image inspect "$i" >/dev/null 2>&1 || docker pull -q --platform linux/amd64 "$i"; done
docker save $IMAGES | zstd -T0 -12 -q -o "$W/ctx/images.tar.zst"
echo "   $(echo $IMAGES | wc -w) images, $(du -h "$W/ctx/images.tar.zst" | cut -f1)"

echo "== 3. the file system"
docker build --platform linux/amd64 -q -t slab-appliance-rootfs "$W/ctx" >/dev/null
CID=$(docker create --platform linux/amd64 slab-appliance-rootfs /bin/true)
mkdir -p "$W/root"; docker export "$CID" | tar -x -C "$W/root"; docker rm -f "$CID" >/dev/null
rm -f "$W/ctx/images.tar.zst"
R="$W/root"
echo safetylab > "$R/etc/hostname"; printf '127.0.0.1 localhost\n127.0.1.1 safetylab\n' > "$R/etc/hosts"
ln -sf /run/systemd/resolve/stub-resolv.conf "$R/etc/resolv.conf"
rm -f "$R/.dockerenv"; : > "$R/etc/machine-id"

echo "== 4. the disk ($DISK_GB GB, grows only as used)"
RAW="$W/disk.raw"; truncate -s ${DISK_GB}G "$RAW"
LD=$(losetup -f --show "$RAW"); trap 'umount -R "$W/mnt" 2>/dev/null; losetup -d "$LD" 2>/dev/null' EXIT
printf 'label: dos\n,,L,*\n' | sfdisk -q "$LD" 2>/dev/null || true; partx -a "$LD" 2>/dev/null || true
mkfs.ext4 -q -L slabroot "${LD}p1"; UUID=$(blkid -s UUID -o value "${LD}p1")
mkdir -p "$W/mnt"; mount "${LD}p1" "$W/mnt"
tar -C "$R" -cf - . | tar -C "$W/mnt" -xf -; rm -rf "$R"
printf 'UUID=%s / ext4 errors=remount-ro 0 1\n' "$UUID" > "$W/mnt/etc/fstab"
for d in dev proc sys; do mount --bind /$d "$W/mnt/$d"; done
KVER=$(ls "$W/mnt/lib/modules" | head -1)
chroot "$W/mnt" update-initramfs -c -k "$KVER" >/dev/null 2>&1 || chroot "$W/mnt" update-initramfs -u -k "$KVER" >/dev/null
chroot "$W/mnt" grub-install --target=i386-pc --modules="part_msdos ext2" "$LD" >/dev/null 2>&1
cat > "$W/mnt/boot/grub/grub.cfg" <<CFG
set timeout=1
set default=0
insmod part_msdos
insmod ext2
search --no-floppy --fs-uuid --set=root $UUID
menuentry 'Safety Lab Aero' {
  linux /boot/vmlinuz-$KVER root=UUID=$UUID ro net.ifnames=1 console=tty1
  initrd /boot/initrd.img-$KVER
}
CFG
for d in dev proc sys; do umount "$W/mnt/$d"; done
umount "$W/mnt"; losetup -d "$LD"; trap - EXIT

echo "== 5. VMware disk and .ova"
VMDK="$NAME-disk1.vmdk"
qemu-img convert -O vmdk -o subformat=streamOptimized,adapter_type=lsilogic "$RAW" "$W/$VMDK"
POP=$(du -B1 "$RAW" | cut -f1)       # bytes the disk really uses (it is sparse)
rm -f "$RAW"
sed -e "s/__VMDK__/$VMDK/" -e "s/__VMDK_BYTES__/$(stat -c %s "$W/$VMDK")/" -e "s/__DISK_GB__/$DISK_GB/" \
    -e "s/__POPULATED__/${POP:-0}/" -e "s/__VERSION__/$VERSION/g" "$HERE/appliance.ovf.template" > "$W/$NAME.ovf"
(cd "$W" && for f in "$NAME.ovf" "$VMDK"; do printf 'SHA256(%s)= %s\n' "$f" "$(sha256sum "$f" | cut -d' ' -f1)"; done > "$NAME.mf")
tar -C "$W" -cf "$OUT/$NAME.ova" "$NAME.ovf" "$NAME.mf" "$VMDK"
rm -rf "$W"
echo "Built $OUT/$NAME.ova  ($(du -h "$OUT/$NAME.ova" | cut -f1))"
