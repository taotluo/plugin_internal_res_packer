/**
 * 内置资源打包插件
 */
'use strict';

const Path = require('fire-path');
const Fs = require('fire-fs');

function getMd5ByUuid(buildResults, uuid) {
	return buildResults._md5Map[uuid] || buildResults._nativeMd5Map[uuid];
}

function getUuidFromPackedAssets(buildResults, uuid) {
	for (const key in buildResults._packedAssets) {
		if (buildResults._packedAssets.hasOwnProperty(key)) {
			const item = buildResults._packedAssets[key];
			for (let index = 0; index < item.length; index++) {
				const element = item[index];
				if (uuid === element) {
					return key;
				}
			}
		}
	}
}

function makeDir(dir) {
	if (!Fs.existsSync(dir)) {
		Fs.ensureDirSync(dir);
	}
}

function getFilePath(buildResults, resDir, uuid, md5) {
	let asset = buildResults._buildAssets[uuid];
	let isRawAsset = asset && asset.nativePath;
	let extension = isRawAsset ? asset.nativePath.split('.').pop() : 'json';
	let dir = Path.join(resDir, isRawAsset ? 'raw-assets' : 'import', uuid.substr(0, 2));
	makeDir(dir);
	return Path.join(dir, `${uuid}.${md5}.${extension}`);
}

function copyFile(src, dst) {
	if (!Fs.existsSync(dst)) {
		Fs.copySync(src, dst);
		// Editor.log(`copy file ${src} ---> ${dst}`);
	}
}

function onBeforeBuildStart(options, callback) {
	if (options.actualPlatform === 'wechatgame' && !options.debug) {
		Fs.removeSync(Path.join(options.dest, 'res'));
		Fs.removeSync(Path.join(options.dest, 'res_internal'));
	}
	callback();
}

function onBeforeBuildFinish(options, callback) {
	callback();
}

function onBuildFinish(options, callback) {

	let buildResults = options.buildResults;

	if (options.actualPlatform === 'wechatgame' && !options.debug && options.md5Cache) {
		function copyAssetByUuid(uuid) {
			let md5 = getMd5ByUuid(buildResults, uuid);
			if (md5) {
				let src = getFilePath(buildResults, Path.join(options.dest, 'res'), uuid, md5);
				let dst = getFilePath(buildResults, Path.join(options.dest, 'res_internal'), uuid, md5);
				copyFile(src, dst);
			}
		}

		function copyAssets(uuids) {
			for (let i = 0; i < uuids.length; ++i) {
				let uuid = uuids[i];
				let asset = buildResults._buildAssets[uuid];
				if (asset && buildResults.getAssetType(uuid) != 'folder') {

					copyAssetByUuid(uuid);

					// 依赖数据
					let asset = buildResults._buildAssets[uuid];
					asset && asset.dependUuids && copyAssets(asset.dependUuids); // 递归依赖

					// 合并数据
					let packedUuid = getUuidFromPackedAssets(buildResults, uuid);
					packedUuid && copyAssetByUuid(packedUuid);
				}
			}
		}

		function queryAssets(dbPath) {
			Editor.assetdb.queryAssets(dbPath, null, (err, assetInfos) => {
				if (!err) {
					let array = assetInfos.map(x => x.uuid);
					copyAssets(array);
				}
			});
		}

		// 打包引擎内置的effects和materials
		queryAssets('db://internal/resources/**/*');

		// 打包启动场景资源
		// 方法1：读路径 queryAssets('db://assets/Scene/LaunchScene.fire');
		// 方法2：读配置
		var startSceneUuid = options.startScene;
		copyAssets([startSceneUuid]);

	}
	callback();
}

module.exports = {
	load() {
		Editor.Builder.on('build-start', onBeforeBuildStart);
		Editor.Builder.on('before-change-files', onBeforeBuildFinish);
		Editor.Builder.on('build-finished', onBuildFinish);
	},

	unload() {
		Editor.Builder.removeListener('build-start', onBeforeBuildStart);
		Editor.Builder.removeListener('before-change-files', onBeforeBuildFinish);
		Editor.Builder.removeListener('build-finished', onBuildFinish);
	},

	messages: {
		'build'() {
			Editor.log('内置资源打包插件');
		}
	},
};