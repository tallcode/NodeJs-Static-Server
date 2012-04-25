/*
* 请求对应表
* forward可以是数组也可以是字符串
* http开头表示重定向
* 10.20.136.137是各分支综合的服务器，未压缩
* 172.22.35.70是预发布服务器，发布脚本改版后，全都是压缩后的代码
*/
var vhost = [
	{
		host:/.*/,
		pathname:/favicon\.ico/,
		forward:404
	},	
	{
		host:/style\.china\.alibaba\.com/,
		pathname:/^\/(.*)$/,
		forward:[
			'http://10.20.136.137/$1',
			'http://172.22.35.70/$1'
		]
	},	
	{
		host:/static\.c\.aliimg\.com/,
		pathname:/^\/(.*)$/,
		forward:[
			'D:\\workspace\\static\\$1',
			'http://10.20.136.137/$1',
			'http://172.22.35.70/$1'
		]
	},
	{
		host:/alibaba-47418.*/,
		pathname:/^\/(.*)$/,
		forward:'D:\\workspace\\website\\$1'
	}
];

var addFile = function (list,file){
	if(file){
		//放入列表前去除css和js文件的压缩
		if(/-min\.(css|js)/.test(file)){
			addFile(list,file.replace(/-min.(css|js)/,'.$1'));
		}
		if(/^http(s?):\/\//.test(file)){
			list.push({type:'redirect',file:file});
		}
		else{
			list.push({type:'disk',file:file});
		}
	}
};

//获取目标文件列表，返回是数组
exports.getTarget = function(obj){
	var
	host = obj.host,
	pathname = obj.pathname,
	forward,fileList = [],
	len = vhost.length;
	for (var i = 0; i < len; i++) {
		if(vhost[i].host.test(host)&&vhost[i].pathname.test(pathname)){
			forward = vhost[i].forward;
			switch (Object.prototype.toString.call(forward)){
				case '[object Array]':
					for(var j=0 ;j<forward.length;j++){
						addFile(fileList,pathname.replace(vhost[i].pathname,forward[j]));
					}
					break;
				case '[object String]':
					addFile(fileList,pathname.replace(vhost[i].pathname,forward));
					break;
				case '[object Number]':
					//新增，直接返回状态
					fileList.push({type:'code',code:forward});
					break;
			}
			return fileList;
		}
	}
	return fileList;
};